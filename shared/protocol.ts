// Contrat partagé entre le serveur et le client : vues de table, réglages, constantes, règle des tuiles.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

/** Les neuf tuiles de chaque joueur. Les paires sont noires, les impaires blanches. */
export const TILES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export const TURNS_PER_SET = 9;
/** Après tant de séries à égalité, le sort tranche : deux joueurs ne doivent pas pouvoir bloquer un tournoi. */
export const MAX_SETS = 3;

export type Color = 'black' | 'white';

export function colorOf(tile: number): Color {
  return tile % 2 === 0 ? 'black' : 'white';
}

/** Les douze motifs du jeu (dessinés dans components/Pattern.tsx). */
export const AVATARS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12'] as const;
export const EMOTES = ['😏', '🤔', '😱', '🧠', '🔥', '🤡'] as const;
export const TAUNTS = ['Tu n’as plus rien.', 'Je sais ce qu’il te reste.', 'Tu la gardes pour quand ?', 'Bien joué.', 'Tu bluffes.', 'Merci pour le cadeau.'] as const;

export const TURN_OPTIONS = [20, 30, 45] as const;
export type TurnTime = (typeof TURN_OPTIONS)[number];

export interface Settings {
  /** Temps pour poser une tuile, en secondes. */
  turn: TurnTime;
}

export type PlayerStatus = 'lobby' | 'playing' | 'out' | 'spectator';

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
}

/** Une manche jouée. Elle ne quitte le serveur qu'une fois le duel terminé. */
export interface TurnRecord {
  set: number;
  turn: number;
  leader: string;
  a: number;
  b: number;
  winner: string | null;
}

export type DuelPhase = 'lead' | 'follow' | 'result' | 'done';

/** Ce que tout le monde voit d'un duel : jamais un chiffre avant la fin, et seulement la manche en cours. */
export interface DuelView {
  set: number;
  turn: number;
  phase: DuelPhase;
  leader: string;
  scoreA: number;
  scoreB: number;
  endsAt: number;
  /** La couleur de la tuile du premier joueur, dès qu'elle est posée. */
  leadColor: Color | null;
  /** La couleur de la tuile du second, au moment du résultat. */
  followColor: Color | null;
  /** Le gagnant de la manche en cours d'affichage (null : égalité). */
  turnWinner: string | null;
  decidedBy: 'points' | 'lot' | null;
  /** Toutes les manches, chiffres compris, seulement quand le duel est fini. */
  turns: TurnRecord[] | null;
}

export interface SlotView {
  id: string;
  round: number;
  index: number;
  a: string | null;
  b: string | null;
  bye: boolean;
  winner: string | null;
  duel: DuelView | null;
}

export interface FinalEntry {
  id: string;
  name: string;
  avatar: string;
  rank: number;
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  /** Le tableau du tournoi, tour par tour. Une seule case à deux joueurs. */
  bracket: SlotView[][];
  roundIndex: number;
  /** Les tuiles qu'il te reste, à toi seul. */
  hand: number[] | null;
  /** La tuile que tu as posée à cette manche, à toi seul. */
  myTile: number | null;
  /** L'entracte entre deux tours du tournoi. */
  interlude: { endsAt: number; readyIds: string[] } | null;
  final: FinalEntry[] | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

/** Le nom d'un tour du tournoi, selon ce qu'il reste à jouer. */
export function roundName(round: number, total: number): string {
  const left = total - round;
  if (left === 1) return total === 1 ? 'Duel' : 'Finale';
  if (left === 2) return 'Demi-finales';
  return 'Quarts de finale';
}
