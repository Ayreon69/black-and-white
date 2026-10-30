// Un duel de Black & White : les tuiles, l'ordre de jeu, les points, la prolongation. Aucune minuterie ici.
import { MAX_SETS, TILES, TURNS_PER_SET, type DuelPhase, type TurnRecord } from '../shared/protocol';

export class Duel {
  readonly hands: Map<string, Set<number>>;
  phase: DuelPhase = 'lead';
  set = 1;
  turn = 1;
  leader: string;
  scoreA = 0;
  scoreB = 0;
  leadTile: number | null = null;
  followTile: number | null = null;
  turnWinner: string | null = null;
  winner: string | null = null;
  decidedBy: 'points' | 'lot' | null = null;
  turns: TurnRecord[] = [];

  constructor(
    readonly a: string,
    readonly b: string,
    leader: string,
    private readonly coin: () => boolean = () => Math.random() < 0.5,
  ) {
    this.leader = leader;
    this.hands = new Map([
      [a, new Set(TILES)],
      [b, new Set(TILES)],
    ]);
  }

  get follower(): string {
    return this.leader === this.a ? this.b : this.a;
  }

  /** À qui de poser, s'il reste quelque chose à poser. */
  get actor(): string | null {
    if (this.phase === 'lead') return this.leader;
    if (this.phase === 'follow') return this.follower;
    return null;
  }

  has(id: string): boolean {
    return id === this.a || id === this.b;
  }

  hand(id: string): number[] {
    return [...(this.hands.get(id) ?? [])].sort((x, y) => x - y);
  }

  /** La tuile que ce joueur a posée à la manche en cours. */
  tileOf(id: string): number | null {
    if (id === this.leader) return this.leadTile;
    if (id === this.follower) return this.followTile;
    return null;
  }

  play(id: string, tile: unknown): string | undefined {
    if (this.actor !== id) return "Ce n'est pas à toi de poser.";
    const hand = this.hands.get(id)!;
    if (typeof tile !== 'number' || !hand.has(tile)) return "Tu n'as plus cette tuile.";
    hand.delete(tile);
    if (this.phase === 'lead') {
      this.leadTile = tile;
      this.phase = 'follow';
    } else {
      this.followTile = tile;
      this.resolve();
    }
    return undefined;
  }

  private resolve(): void {
    const lead = this.leadTile!;
    const follow = this.followTile!;
    this.turnWinner = lead === follow ? null : lead > follow ? this.leader : this.follower;
    if (this.turnWinner === this.a) this.scoreA++;
    if (this.turnWinner === this.b) this.scoreB++;
    this.turns.push({
      set: this.set,
      turn: this.turn,
      leader: this.leader,
      a: this.leader === this.a ? lead : follow,
      b: this.leader === this.b ? lead : follow,
      winner: this.turnWinner,
    });
    this.phase = 'result';
  }

  /** Le résultat a été vu : on passe à la manche suivante, ou on clôt le duel. */
  next(): void {
    if (this.phase !== 'result') return;
    const left = TURNS_PER_SET - this.turn;
    const gap = this.scoreA - this.scoreB;
    if (Math.abs(gap) > left) {
      // L'écart ne peut plus être comblé : inutile de jouer la suite.
      this.finish(gap > 0 ? this.a : this.b, 'points');
      return;
    }
    // Le gagnant ouvre la manche suivante. Sur une égalité, l'ordre ne change pas.
    if (this.turnWinner) this.leader = this.turnWinner;
    this.leadTile = null;
    this.followTile = null;
    this.turnWinner = null;
    if (left === 0) {
      if (this.set >= MAX_SETS) {
        this.finish(this.coin() ? this.a : this.b, 'lot');
        return;
      }
      this.set++;
      this.turn = 1;
      this.scoreA = 0;
      this.scoreB = 0;
      this.hands.set(this.a, new Set(TILES));
      this.hands.set(this.b, new Set(TILES));
    } else {
      this.turn++;
    }
    this.phase = 'lead';
  }

  private finish(winner: string, by: 'points' | 'lot'): void {
    this.winner = winner;
    this.decidedBy = by;
    this.phase = 'done';
  }
}
