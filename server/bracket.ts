// Le tableau du tournoi : élimination directe, avec des exemptions au premier tour si le compte n'est pas rond.

export interface Slot {
  id: string;
  round: number;
  index: number;
  a: string | null;
  b: string | null;
  bye: boolean;
  winner: string | null;
}

/** Construit le tableau à partir de joueurs déjà mélangés. */
export function buildBracket(ids: string[]): Slot[][] {
  let size = 2;
  while (size < ids.length) size *= 2;
  const rounds: Slot[][] = [];
  for (let r = 0, n = size / 2; n >= 1; r++, n /= 2) {
    rounds.push(Array.from({ length: n }, (_, index) => ({ id: `r${r}m${index}`, round: r, index, a: null, b: null, bye: false, winner: null })));
  }
  // Les exemptés occupent chacun une case du premier tour : il n'y a jamais de case vide.
  const byes = size - ids.length;
  const queue = [...ids];
  rounds[0].forEach((slot, i) => {
    slot.a = queue.shift()!;
    if (i < byes) slot.bye = true;
    else slot.b = queue.shift()!;
  });
  for (const slot of rounds[0]) if (slot.bye) settle(rounds, slot, slot.a!);
  return rounds;
}

/** Inscrit le vainqueur d'une case et le fait monter au tour suivant. */
export function settle(rounds: Slot[][], slot: Slot, winner: string): void {
  slot.winner = winner;
  const up = rounds[slot.round + 1]?.[Math.floor(slot.index / 2)];
  if (!up) return;
  if (slot.index % 2 === 0) up.a = winner;
  else up.b = winner;
}

/** Le perdant d'une case tombe au rang qui suit tous ceux qui vont plus loin que lui. */
export function loserRank(round: number, total: number): number {
  return 2 ** (total - 1 - round) + 1;
}
