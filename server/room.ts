// Une table de Black & White : salon, tableau du tournoi, duels simultanés et minuteries.
import crypto from 'node:crypto';
import { AVATARS, MAX_PLAYERS, MIN_PLAYERS, TAUNTS, TURNS_PER_SET, TURN_OPTIONS, colorOf, type DuelView, type FinalEntry, type PlayerStatus, type RoomView, type Settings, type SlotView, type TurnTime } from '../shared/protocol';
import { botTile, randomPersonality, type Personality, type Seen } from './bots';
import { buildBracket, loserRank, settle, type Slot } from './bracket';
import { Duel } from './duel';

const BOT_NAMES = ['Ivoire', 'Ébène', 'Pie', 'Zèbre', 'Domino', 'Corbeau', 'Neige', 'Encre'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (BW_FAST=1) : bots et chronos quasi instantanés. */
const FAST = process.env.BW_FAST === '1';
/** Le temps de lire le résultat d'une manche. */
const RESULT_MS = FAST ? 30 : 3_400;
const RESULT_BOTS_MS = FAST ? 20 : 1_800;
/** La dernière tuile n'est pas un choix : elle se pose toute seule, le temps de comprendre ce qu'il se passe. */
const FORCED_MS = FAST ? 10 : 1_400;
/** Le temps de voir le vainqueur d'un tour avant de passer à la suite. */
const DWELL_MS = FAST ? 30 : 3_500;
const INTERLUDE_MS = FAST ? 60 : 15_000;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  personality: Personality;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
  rank: number | null;
}

interface LiveSlot extends Slot {
  duel: Duel | null;
  endsAt: number;
  /** Quand le bot, le pilote ou la tuile forcée doit se poser. */
  autoAt: number | null;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { turn: 30 };
  players: Player[] = [];
  bracket: LiveSlot[][] = [];
  roundIndex = 0;
  final: FinalEntry[] | null = null;
  interlude: { endsAt: number; ready: Set<string> } | null = null;
  dwellUntil: number | null = null;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      personality: randomPersonality(),
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: Date.now(),
      left: false,
      status,
      rank: null,
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    if (this.phase === 'lobby' && this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, this.phase === 'lobby' ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    this.players.push(this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby'));
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else p.left = true;
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if ((TURN_OPTIONS as readonly unknown[]).includes(payload.turn)) this.settings.turn = payload.turn as TurnTime;
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    for (const p of seated) {
      p.status = 'playing';
      p.rank = null;
      if (p.isBot) p.personality = randomPersonality();
    }
    this.phase = 'playing';
    this.final = null;
    this.bracket = buildBracket(shuffle(seated.map((p) => p.id))).map((round) => round.map((slot) => ({ ...slot, duel: null, endsAt: 0, autoAt: null })));
    this.roundIndex = 0;
    this.startRound();
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
      p.rank = null;
    }
    this.phase = 'lobby';
    this.bracket = [];
    this.final = null;
    this.interlude = null;
    this.dwellUntil = null;
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    return this.restart(by);
  }

  private startRound(): void {
    this.interlude = null;
    this.dwellUntil = null;
    for (const slot of this.bracket[this.roundIndex]) {
      if (slot.bye) continue;
      // Pas de cagnotte de départ ici : le sort désigne qui ouvre.
      const first = crypto.randomInt(2) === 0 ? slot.a! : slot.b!;
      slot.duel = new Duel(slot.a!, slot.b!, first);
      this.arm(slot);
    }
  }

  private arm(slot: LiveSlot): void {
    const duel = slot.duel!;
    const now = Date.now();
    const actorId = duel.actor;
    if (!actorId) {
      const bots = this.get(duel.a)?.isBot && this.get(duel.b)?.isBot;
      slot.endsAt = now + (bots ? RESULT_BOTS_MS : RESULT_MS);
      slot.autoAt = null;
      return;
    }
    const actor = this.get(actorId)!;
    slot.endsAt = now + (FAST ? 400 : this.settings.turn * 1000);
    const bothBots = this.get(duel.a)?.isBot && this.get(duel.b)?.isBot;
    if (duel.hand(actorId).length === 1) slot.autoAt = now + FORCED_MS;
    else if (this.isAuto(actor)) slot.autoAt = now + (FAST ? 5 : bothBots ? 500 + Math.random() * 900 : 1200 + Math.random() * 2800);
    else slot.autoAt = null;
  }

  /** Ce que le joueur a vu de son duel : c'est tout ce que son remplaçant a le droit de savoir. */
  private seenBy(duel: Duel, id: string): Seen[] {
    return duel.turns
      .filter((t) => t.set === duel.set)
      .map((t) => {
        const mine = id === duel.a ? t.a : t.b;
        const theirs = id === duel.a ? t.b : t.a;
        return { oppColor: colorOf(theirs), mine, outcome: t.winner === null ? 'draw' : t.winner === id ? 'win' : 'lose' };
      });
  }

  private autoTile(duel: Duel, id: string): number {
    const p = this.get(id)!;
    const opp = id === duel.a ? duel.b : duel.a;
    return botTile({
      hand: duel.hand(id),
      history: this.seenBy(duel, id),
      oppColor: duel.phase === 'follow' ? colorOf(duel.leadTile!) : null,
      myScore: id === duel.a ? duel.scoreA : duel.scoreB,
      oppScore: opp === duel.a ? duel.scoreA : duel.scoreB,
      turnsLeft: TURNS_PER_SET - duel.turn + 1,
      personality: p.personality,
    });
  }

  private slotOf(id: string): LiveSlot | undefined {
    return this.bracket[this.roundIndex]?.find((s) => s.duel && s.duel.has(id) && s.duel.phase !== 'done');
  }

  play(id: string, tile: unknown): string | undefined {
    if (this.phase !== 'playing') return 'Aucune partie en cours.';
    const slot = this.slotOf(id);
    if (!slot) return "Tu n'as pas de duel en cours.";
    const err = slot.duel!.play(id, tile);
    if (err) return err;
    this.arm(slot);
    return undefined;
  }

  ready(id: string): string | undefined {
    if (!this.interlude) return undefined;
    if (this.interlude.ready.has(id)) this.interlude.ready.delete(id);
    else this.interlude.ready.add(id);
    const needed = this.players.filter((p) => !p.isBot && !p.left && p.connected);
    if (needed.every((p) => this.interlude!.ready.has(p.id))) this.nextRound();
    return undefined;
  }

  private nextRound(): void {
    this.roundIndex++;
    this.startRound();
  }

  private settleDuel(slot: LiveSlot): void {
    const duel = slot.duel!;
    const winner = duel.winner!;
    settle(this.bracket, slot, winner);
    const loser = this.get(winner === duel.a ? duel.b : duel.a)!;
    loser.status = 'out';
    loser.rank = loserRank(slot.round, this.bracket.length);
    const hero = this.get(winner)!;
    if (hero.isBot && !loser.isBot && !FAST && Math.random() < 0.3) this.onEmote(hero.id, TAUNTS[3]);
    if (this.bracket[this.roundIndex].every((s) => s.winner)) this.dwellUntil = Date.now() + DWELL_MS;
  }

  private afterDwell(): void {
    this.dwellUntil = null;
    if (this.roundIndex >= this.bracket.length - 1) {
      this.finishGame();
      return;
    }
    const allBots = this.players.every((p) => p.isBot || p.left || p.status === 'spectator' || !p.connected);
    if (allBots) this.nextRound();
    else this.interlude = { endsAt: Date.now() + INTERLUDE_MS, ready: new Set() };
  }

  private finishGame(): void {
    const finalSlot = this.bracket[this.bracket.length - 1][0];
    this.get(finalSlot.winner!)!.rank = 1;
    this.final = this.seated
      .filter((p) => p.rank !== null)
      .sort((x, y) => x.rank! - y.rank!)
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, rank: p.rank! }));
    this.phase = 'finished';
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  private reschedule(): void {
    this.clearTimer();
    if (this.phase !== 'playing') return;
    const now = Date.now();
    let due = Infinity;
    if (this.interlude) due = this.interlude.endsAt;
    if (this.dwellUntil !== null) due = Math.min(due, this.dwellUntil);
    for (const slot of this.bracket[this.roundIndex] ?? []) {
      const duel = slot.duel;
      if (!duel || duel.phase === 'done') continue;
      due = Math.min(due, slot.endsAt);
      if (slot.autoAt !== null) due = Math.min(due, slot.autoAt);
      // Un joueur qui vient de quitter la table ne fait attendre personne.
      if (duel.actor && slot.autoAt === null && this.get(duel.actor)?.left) due = now;
    }
    if (due === Infinity) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, due - now));
  }

  tick(): void {
    const now = Date.now();
    if (this.interlude) {
      if (now >= this.interlude.endsAt) this.nextRound();
      return;
    }
    if (this.dwellUntil !== null && now >= this.dwellUntil) {
      this.afterDwell();
      return;
    }
    for (const slot of this.bracket[this.roundIndex] ?? []) {
      const duel = slot.duel;
      if (!duel || duel.phase === 'done') continue;
      if (duel.phase === 'result') {
        if (now < slot.endsAt) continue;
        duel.next();
        if (duel.winner) this.settleDuel(slot);
        else this.arm(slot);
        continue;
      }
      const actorId = duel.actor!;
      const actor = this.get(actorId)!;
      const autoDue = (slot.autoAt !== null && now >= slot.autoAt) || actor.left;
      if (!autoDue && now < slot.endsAt) continue;
      // Un présent qui laisse filer le temps pose au hasard ; un absent est remplacé par le pilote.
      const hand = duel.hand(actorId);
      const tile = this.isAuto(actor) || hand.length === 1 ? this.autoTile(duel, actorId) : hand[crypto.randomInt(hand.length)];
      duel.play(actorId, tile);
      this.arm(slot);
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  private duelView(slot: LiveSlot): DuelView | null {
    const d = slot.duel;
    if (!d) return null;
    const showing = d.phase === 'result' || d.phase === 'done';
    return {
      set: d.set,
      turn: d.turn,
      phase: d.phase,
      leader: d.leader,
      scoreA: d.scoreA,
      scoreB: d.scoreB,
      endsAt: slot.endsAt,
      // Le cœur du jeu : une couleur, jamais un chiffre, et rien sur les manches passées.
      leadColor: d.leadTile === null ? null : colorOf(d.leadTile),
      followColor: showing && d.followTile !== null ? colorOf(d.followTile) : null,
      turnWinner: d.phase === 'result' ? d.turnWinner : null,
      decidedBy: d.decidedBy,
      turns: d.phase === 'done' ? d.turns : null,
    };
  }

  viewFor(viewerId: string): RoomView {
    const mine = this.slotOf(viewerId)?.duel ?? null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        connected: p.isBot || p.connected,
        autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
        status: p.status,
      })),
      bracket: this.bracket.map((round) =>
        round.map((slot): SlotView => ({ id: slot.id, round: slot.round, index: slot.index, a: slot.a, b: slot.b, bye: slot.bye, winner: slot.winner, duel: this.duelView(slot) })),
      ),
      roundIndex: this.roundIndex,
      hand: mine ? mine.hand(viewerId) : null,
      myTile: mine ? mine.tileOf(viewerId) : null,
      interlude: this.interlude ? { endsAt: this.interlude.endsAt, readyIds: [...this.interlude.ready] } : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
