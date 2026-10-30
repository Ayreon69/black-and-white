// Petits sons synthétisés (Web Audio) : le claquement des tuiles, aucun fichier à charger.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.value = opts.freq ?? 2400;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  pick: () => tone(520, 0.05, { type: 'triangle', gain: 0.08 }),
  /** Une tuile claquée sur la table. */
  place: () => {
    noise(0.05, { gain: 0.7, freq: 1800 });
    tone(140, 0.09, { gain: 0.2, slide: 0.6 });
  },
  /** L'adversaire a posé : c'est à toi. */
  yours: () => {
    noise(0.05, { gain: 0.5, freq: 1400 });
    tone(330, 0.16, { type: 'triangle', gain: 0.08, delay: 0.08 });
  },
  tick: () => tone(1500, 0.02, { type: 'square', gain: 0.02 }),
  win: () => [392, 587].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.1, delay: i * 0.1 })),
  lose: () => tone(196, 0.5, { type: 'sawtooth', gain: 0.07, slide: 0.6 }),
  draw: () => [262, 262].forEach((f, i) => tone(f, 0.12, { type: 'square', gain: 0.03, delay: i * 0.14 })),
  flip: () => noise(0.04, { gain: 0.3, freq: 3000 }),
  champion: () => [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(f, 0.7, { type: 'triangle', gain: 0.08, delay: i * 0.14 })),
  fall: () => [196, 147].forEach((f, i) => tone(f, 0.9, { type: 'sawtooth', gain: 0.07, slide: 0.4, delay: i * 0.1 })),
  pop: () => tone(700, 0.08, { gain: 0.06, slide: 1.6 }),
};
