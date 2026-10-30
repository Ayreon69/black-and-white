// Les bots raisonnent comme un joueur : ils ne connaissent que leurs tuiles, les couleurs vues et les résultats.
import { TILES, colorOf, type Color } from '../shared/protocol';

export interface Personality {
  /** Ce que lui coûte de brûler une grosse tuile : plus c'est haut, plus il les garde. */
  thrift: number;
  /** Sa part d'imprévisible. */
  noise: number;
}

export function randomPersonality(): Personality {
  return { thrift: 0.75 + Math.random() * 0.5, noise: 0.08 + Math.random() * 0.22 };
}

/** Ce qu'un joueur a vu d'une manche passée. */
export interface Seen {
  oppColor: Color;
  mine: number;
  outcome: 'win' | 'lose' | 'draw';
}

export interface BotView {
  hand: number[];
  history: Seen[];
  /** La couleur que l'adversaire vient de poser, si le bot répond. */
  oppColor: Color | null;
  myScore: number;
  oppScore: number;
  turnsLeft: number;
  personality: Personality;
}

function fits(tile: number, seen: Seen): boolean {
  if (colorOf(tile) !== seen.oppColor) return false;
  if (seen.outcome === 'win') return tile < seen.mine;
  if (seen.outcome === 'lose') return tile > seen.mine;
  return tile === seen.mine;
}

/**
 * Pour chaque tuile, le nombre de façons d'expliquer tout ce qui a été vu sans l'avoir utilisée :
 * une tuile comptée souvent a de bonnes chances d'être encore dans la main adverse.
 */
export function oppWeights(history: Seen[]): Map<number, number> {
  const memo = new Map<number, number>();
  const ways = (idx: number, used: number): number => {
    if (idx === history.length) return 1;
    const key = used | (idx << 9);
    const known = memo.get(key);
    if (known !== undefined) return known;
    let total = 0;
    for (const t of TILES) {
      if (!(used & (1 << t)) && fits(t, history[idx])) total += ways(idx + 1, used | (1 << t));
    }
    memo.set(key, total);
    return total;
  };
  const out = new Map<number, number>();
  for (const t of TILES) {
    const w = ways(0, 1 << t);
    if (w > 0) out.set(t, w);
  }
  return out;
}

export function botTile(view: BotView, rand: () => number = Math.random): number {
  const { hand, history, oppColor, personality } = view;
  if (hand.length === 1) return hand[0];
  const weights = oppWeights(history);
  const pool = [...weights].filter(([t]) => !oppColor || colorOf(t) === oppColor);
  const total = pool.reduce((sum, [, w]) => sum + w, 0) || 1;
  // Mené au point de ne plus pouvoir perdre une manche, il ne garde plus rien pour plus tard.
  const desperate = view.oppScore - view.myScore >= view.turnsLeft - 1;
  const thrift = personality.thrift * (desperate ? 0.25 : 1);
  // En premier, il ne sait rien de la réponse : il se rend plus difficile à lire.
  const noise = personality.noise * (oppColor ? 1 : 2);
  let best = hand[0];
  let bestScore = -Infinity;
  for (const t of hand) {
    const win = pool.reduce((sum, [c, w]) => sum + (c < t ? w : 0), 0) / total;
    const score = win - (thrift * t) / 8 + (rand() - 0.5) * noise;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}
