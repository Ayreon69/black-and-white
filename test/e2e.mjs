// Test de bout en bout : 3 humains (socket.io) + 2 bots jouent un tournoi complet sur le serveur compilé.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), BW_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (3 min)'), 180_000).unref();

await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

let audited = 0;
let colors = 0;

function client(name) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null };
  socket.on('state', (v) => {
    c.view = v;
    audit(v);
    play(c);
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Vérifie les secrets sur chaque état reçu. */
function audit(v) {
  if (v.phase !== 'playing') return;
  audited++;
  for (const round of v.bracket) {
    for (const s of round) {
      const d = s.duel;
      if (!d) continue;
      if (d.phase !== 'done' && d.turns) fail("les chiffres d'un duel en cours circulent");
      if (d.phase === 'follow' && d.followColor) fail('la couleur du second sort avant le résultat');
      if (d.leadColor) colors++;
    }
  }
  const mine = v.bracket[v.roundIndex]?.find((s) => s.a === v.me || s.b === v.me);
  if (!mine?.duel && v.hand) fail('une main sans duel');
}

function play(c) {
  const v = c.view;
  if (!v || v.phase !== 'playing') return;
  if (v.interlude) {
    if (!v.interlude.readyIds.includes(v.me)) c.socket.emit('game:next', {}, () => {});
    return;
  }
  const slot = v.bracket[v.roundIndex]?.find((s) => s.a === v.me || s.b === v.me);
  const d = slot?.duel;
  if (!d || !v.hand?.length || v.myTile !== null) return;
  const mineFirst = d.leader === v.me;
  if ((d.phase === 'lead' && mineFirst) || (d.phase === 'follow' && !mineFirst)) {
    c.socket.emit('game:play', { tile: v.hand[Math.floor(Math.random() * v.hand.length)] }, () => {});
  }
}

const a = client('Alice');
const b = client('Bob');
const d = client('Chloé');
await Promise.all([a, b, d].map((c) => new Promise((r) => c.socket.on('connect', r))));

const created = await a.call('room:create', { name: 'Alice', avatar: 'p1' });
if (!created.ok) fail(`création : ${created.error}`);
const code = created.data.code;
const joined = await b.call('room:join', { code: code.toLowerCase(), name: 'Bob', avatar: 'p2' });
if (!joined.ok) fail(`jointure : ${joined.error}`);
const third = await d.call('room:join', { code, name: 'Chloé', avatar: 'p3' });
if (!third.ok) fail(`jointure : ${third.error}`);
for (let i = 0; i < 2; i++) await a.call('room:addBot');
const denied = await b.call('game:start');
if (denied.ok) fail('un invité ne devrait pas pouvoir lancer la partie');
const started = await a.call('game:start');
if (!started.ok) fail(`lancement : ${started.error}`);
console.log(`✓ table ${code} lancée à 5 joueurs`);

// Bob se déconnecte puis revient avec son jeton : il doit retrouver sa place.
b.socket.disconnect();
await new Promise((r) => setTimeout(r, 30));
const b2 = client('Bob');
await new Promise((r) => b2.socket.on('connect', r));
const resumed = await b2.call('room:join', { code, ...joined.data, resumeOnly: true });
if (!resumed.ok || resumed.data.playerId !== joined.data.playerId) fail('reprise de session échouée');
console.log('✓ reconnexion de Bob sur sa place');

await new Promise((resolve) => {
  const check = setInterval(() => {
    if (a.view?.phase === 'finished') {
      clearInterval(check);
      resolve();
    }
  }, 50);
});
if (!audited || !colors) fail("aucun état n'a été contrôlé");
console.log(`✓ aucun chiffre avant la fin d'un duel, sur ${audited} états reçus`);
const final = a.view.final;
if (final.length !== 5) fail('il doit y avoir 5 joueurs au classement');
if (final.filter((f) => f.rank === 1).length !== 1) fail('il doit y avoir un seul vainqueur');
const played = a.view.bracket.flat().filter((s) => s.duel);
if (played.length !== 4) fail('un tournoi à 5 joue 4 duels');
if (played.some((s) => !s.duel.turns?.length)) fail('les chiffres doivent être révélés à la fin');
console.log(`✓ tournoi terminé, vainqueur : ${final[0].name}`);

await a.call('game:restart');
await new Promise((r) => setTimeout(r, 100));
if (a.view.phase !== 'lobby') fail('retour au salon échoué');
console.log('✓ retour au salon pour une revanche');

a.socket.close();
b2.socket.close();
d.socket.close();
server.kill();
console.log('✓ test de bout en bout réussi');
process.exit(0);
