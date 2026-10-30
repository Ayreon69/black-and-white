// Le duel, le tableau du tournoi, les bots et les secrets de la vue envoyée à chaque joueur.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PLAYERS, TILES, colorOf } from '../shared/protocol';
import { botTile, oppWeights, randomPersonality, type Seen } from '../server/bots';
import { buildBracket, loserRank, settle } from '../server/bracket';
import { Duel } from '../server/duel';
import { Room } from '../server/room';

/** Joue une manche entière : le premier pose lead, le second follow. */
function turn(d: Duel, lead: number, follow: number): void {
  expect(d.play(d.leader, lead)).toBeUndefined();
  expect(d.play(d.follower, follow)).toBeUndefined();
}

describe('couleurs', () => {
  it('les paires sont noires et le zéro aussi, les impaires blanches', () => {
    expect(TILES.filter((t) => colorOf(t) === 'black')).toEqual([0, 2, 4, 6, 8]);
    expect(TILES.filter((t) => colorOf(t) === 'white')).toEqual([1, 3, 5, 7]);
  });
});

describe('duel', () => {
  it('la plus haute tuile marque le point, et le gagnant ouvre la manche suivante', () => {
    const d = new Duel('a', 'b', 'a');
    turn(d, 3, 5);
    expect(d.turnWinner).toBe('b');
    expect(d.scoreB).toBe(1);
    d.next();
    expect(d.leader).toBe('b');
    expect(d.turn).toBe(2);
  });

  it("sur une égalité, personne ne marque et l'ordre ne change pas", () => {
    const d = new Duel('a', 'b', 'a');
    turn(d, 4, 4);
    expect(d.turnWinner).toBeNull();
    expect(d.scoreA + d.scoreB).toBe(0);
    d.next();
    expect(d.leader).toBe('a');
  });

  it('refuse de jouer hors de son tour, une tuile déjà jouée ou inexistante', () => {
    const d = new Duel('a', 'b', 'a');
    expect(d.play('b', 1)).toBeTruthy();
    expect(d.play('a', 9)).toBeTruthy();
    expect(d.play('a', '3')).toBeTruthy();
    turn(d, 3, 5);
    d.next();
    expect(d.play('a', 4)).toBeTruthy();
    expect(d.play('b', 5)).toBeTruthy();
    expect(d.hand('a')).not.toContain(3);
  });

  it("s'arrête dès que l'écart ne peut plus être comblé, pas avant", () => {
    const d = new Duel('a', 'b', 'a');
    const plays = [[8, 7], [7, 6], [6, 5], [5, 4]];
    for (const [x, y] of plays) {
      turn(d, x, y);
      d.next();
    }
    // 4-0 après quatre manches : il en reste cinq, rien n'est joué.
    expect(d.phase).toBe('lead');
    turn(d, 4, 3);
    d.next();
    expect(d.phase).toBe('done');
    expect(d.winner).toBe('a');
    expect(d.decidedBy).toBe('points');
    expect(d.turns).toHaveLength(5);
  });

  it('à égalité après neuf manches : neuf nouvelles tuiles, puis le sort à la troisième série', () => {
    const d = new Duel('a', 'b', 'a', () => false);
    for (let set = 1; set <= 3; set++) {
      expect(d.set).toBe(set);
      expect(d.hand('a')).toHaveLength(9);
      for (const t of TILES) {
        turn(d, t, t);
        d.next();
      }
    }
    expect(d.phase).toBe('done');
    expect(d.decidedBy).toBe('lot');
    expect(d.winner).toBe('b');
  });
});

describe('tableau', () => {
  it('oppose directement deux joueurs', () => {
    const b = buildBracket(['a', 'b']);
    expect(b).toHaveLength(1);
    expect(b[0][0]).toMatchObject({ a: 'a', b: 'b', bye: false });
  });

  it.each([3, 4, 5, 6, 7, 8])('à %i joueurs, chacun est placé une fois et il ne reste jamais de case vide', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const rounds = buildBracket(ids);
    const first = rounds[0].flatMap((s) => [s.a, s.b]).filter(Boolean);
    expect(new Set(first).size).toBe(n);
    // On joue tout le tableau : le premier inscrit gagne toujours.
    let matches = 0;
    for (const round of rounds) {
      for (const slot of round) {
        if (slot.bye) continue;
        expect(slot.a).toBeTruthy();
        expect(slot.b).toBeTruthy();
        matches++;
        settle(rounds, slot, slot.a!);
      }
    }
    expect(matches).toBe(n - 1);
    expect(rounds.at(-1)![0].winner).toBeTruthy();
  });

  it('classe les perdants selon le tour où ils tombent', () => {
    expect(loserRank(2, 3)).toBe(2);
    expect(loserRank(1, 3)).toBe(3);
    expect(loserRank(0, 3)).toBe(5);
  });
});

describe('bots', () => {
  const seen = (oppColor: Seen['oppColor'], mine: number, outcome: Seen['outcome']): Seen => ({ oppColor, mine, outcome });

  it('déduit ce qui reste possible à partir des couleurs et des résultats', () => {
    // Une noire a battu mon 6 : c'était le 8, il ne peut plus l'avoir.
    const w = oppWeights([seen('black', 6, 'lose')]);
    expect(w.has(8)).toBe(false);
    expect(w.has(0)).toBe(true);
  });

  it('comprend une égalité : la tuile est connue et sortie', () => {
    const w = oppWeights([seen('white', 3, 'draw')]);
    expect(w.has(3)).toBe(false);
    expect(w.has(5)).toBe(true);
  });

  it('ne pose que des tuiles qu’il possède', () => {
    for (let i = 0; i < 200; i++) {
      const hand: number[] = TILES.filter(() => Math.random() < 0.5);
      if (!hand.length) continue;
      const t = botTile({ hand, history: [], oppColor: i % 2 ? 'black' : null, myScore: 0, oppScore: 0, turnsLeft: hand.length, personality: randomPersonality() });
      expect(hand).toContain(t);
    }
  });

  it('bat largement un joueur qui pose au hasard', () => {
    let wins = 0;
    const games = 400;
    for (let g = 0; g < games; g++) {
      const d = new Duel('bot', 'alea', g % 2 ? 'bot' : 'alea');
      const personality = randomPersonality();
      while (d.phase !== 'done') {
        const actor = d.actor!;
        if (actor === 'alea') {
          const h = d.hand('alea');
          d.play('alea', h[Math.floor(Math.random() * h.length)]);
        } else {
          const history: Seen[] = d.turns
            .filter((t) => t.set === d.set)
            .map((t) => ({ oppColor: colorOf(t.b), mine: t.a, outcome: t.winner === null ? 'draw' : t.winner === 'bot' ? 'win' : 'lose' }));
          d.play('bot', botTile({ hand: d.hand('bot'), history, oppColor: d.phase === 'follow' ? colorOf(d.leadTile!) : null, myScore: d.scoreA, oppScore: d.scoreB, turnsLeft: 10 - d.turn, personality }));
        }
        if (d.phase === 'result') d.next();
      }
      if (d.winner === 'bot') wins++;
    }
    expect(wins / games).toBeGreaterThan(0.55);
  });
});

describe('table', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function table(humans: number, bots = 0) {
    const room = new Room('TEST');
    const players = Array.from({ length: humans }, (_, i) => {
      const p = room.addHuman(`Joueur ${i}`, 'p1');
      if (typeof p === 'string') throw new Error(p);
      p.connected = true;
      return p;
    });
    room.hostId = players[0].id;
    for (let i = 0; i < bots; i++) room.addBot(players[0].id);
    return { room, players };
  }

  /** Fait tourner le serveur jusqu'à la fin, les humains posant leur première tuile. */
  function playOut(room: Room, audit?: (r: Room) => void) {
    for (let i = 0; i < 20000 && room.phase === 'playing'; i++) {
      audit?.(room);
      for (const p of room.players) {
        const v = room.viewFor(p.id);
        if (p.isBot || !v.hand?.length) continue;
        room.play(p.id, v.hand[0]);
      }
      if (room.interlude) for (const p of room.players) if (!p.isBot && !room.interlude?.ready.has(p.id)) room.ready(p.id);
      vi.advanceTimersByTime(5000);
      room.tick();
    }
    expect(room.phase).toBe('finished');
  }

  it('seul l’hôte lance, et pas seul', () => {
    const { room, players } = table(2);
    expect(room.start(players[1].id)).toBeTruthy();
    const solo = table(1).room;
    expect(solo.start(solo.hostId)).toBeTruthy();
    expect(room.start(players[0].id)).toBeUndefined();
    expect(room.phase).toBe('playing');
  });

  it('refuse un joueur de trop', () => {
    const { room, players } = table(1, MAX_PLAYERS - 1);
    expect(room.addBot(players[0].id)).toBeTruthy();
    expect(typeof room.addHuman('Tard', 'p1')).toBe('string');
  });

  it('ne laisse sortir ni un chiffre adverse, ni le passé d’un duel en cours', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const [a, b] = players;
    const lead = room.bracket[0][0].duel!.leader;
    const other = lead === a.id ? b.id : a.id;
    room.play(lead, 7);
    const v = room.viewFor(other);
    expect(v.bracket[0][0].duel!.leadColor).toBe('white');
    expect(v.myTile).toBeNull();
    expect(v.hand).toHaveLength(9);
    expect(v.bracket[0][0].duel!.turns).toBeNull();
    expect(room.viewFor(lead).myTile).toBe(7);
    room.play(other, 8);
    const after = room.viewFor(lead);
    expect(after.bracket[0][0].duel!.followColor).toBe('black');
    expect(after.bracket[0][0].duel!.turnWinner).toBe(other);
    expect(after.bracket[0][0].duel!.turns).toBeNull();
    vi.advanceTimersByTime(5000);
    room.tick();
    const next = room.viewFor(lead);
    // La manche passée a disparu : la couleur précédente ne se consulte nulle part.
    expect(next.bracket[0][0].duel!.leadColor).toBeNull();
    expect(next.bracket[0][0].duel!.followColor).toBeNull();
  });

  it('un spectateur n’a ni main ni tuile, et ne voit aucun chiffre', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const spy = room.addHuman('Curieux', 'p2');
    if (typeof spy === 'string') throw new Error(spy);
    expect(spy.status).toBe('spectator');
    room.play(room.bracket[0][0].duel!.leader, 5);
    const v = room.viewFor(spy.id);
    expect(v.hand).toBeNull();
    expect(v.myTile).toBeNull();
    expect(v.bracket[0][0].duel!.turns).toBeNull();
  });

  it('révèle tous les chiffres à la fin du duel, et classe le vainqueur', () => {
    const { room, players } = table(1, 1);
    room.start(players[0].id);
    playOut(room);
    const v = room.viewFor(players[0].id);
    expect(v.final).toHaveLength(2);
    expect(v.final![0].rank).toBe(1);
    expect(v.final![1].rank).toBe(2);
    expect(v.bracket[0][0].duel!.turns!.length).toBeGreaterThanOrEqual(5);
  });

  it.each([3, 5, 8])('joue un tournoi complet à %i joueurs', (n) => {
    const { room, players } = table(2, n - 2);
    room.start(players[0].id);
    playOut(room, (r) => {
      for (const p of r.players) {
        for (const round of r.viewFor(p.id).bracket) for (const s of round) if (s.duel && s.duel.phase !== 'done') expect(s.duel.turns).toBeNull();
      }
    });
    const final = room.viewFor(players[0].id).final!;
    expect(final).toHaveLength(n);
    expect(final.filter((f) => f.rank === 1)).toHaveLength(1);
    expect(final.filter((f) => f.rank === 2)).toHaveLength(1);
  });

  it('un joueur parti est remplacé par le pilote et ne bloque pas la table', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    room.leave(players[1].id);
    expect(room.hostId).toBe(players[0].id);
    playOut(room);
  });

  it('un joueur présent qui laisse filer le temps pose au hasard', () => {
    const { room, players } = table(2);
    room.start(players[0].id);
    const d = room.bracket[0][0].duel!;
    const lead = d.leader;
    vi.advanceTimersByTime(31_000);
    room.tick();
    expect(d.hand(lead)).toHaveLength(8);
  });

  it('une partie lancée dès la création ne prend pas le créateur pour un absent', () => {
    const room = new Room('TEST');
    const p = room.addHuman('Pressé', 'p1');
    if (typeof p === 'string') throw new Error(p);
    room.hostId = p.id;
    room.addBot(p.id);
    room.start(p.id);
    const d = room.bracket[0][0].duel!;
    if (d.leader !== p.id) {
      vi.advanceTimersByTime(5000);
      room.tick();
    }
    vi.advanceTimersByTime(5000);
    room.tick();
    expect(d.hand(p.id)).toHaveLength(9);
  });

  it('retourne au salon pour une revanche', () => {
    const { room, players } = table(1, 1);
    room.start(players[0].id);
    playOut(room);
    room.restart(players[0].id);
    expect(room.phase).toBe('lobby');
    expect(room.start(players[0].id)).toBeUndefined();
  });
});
