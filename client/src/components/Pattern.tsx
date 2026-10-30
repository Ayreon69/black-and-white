// Les douze motifs qui servent d'avatars : de l'op art en noir et blanc, lisible à toute taille.
import { type ReactNode } from 'react';
import { cls } from '../lib/util';

const stripes = (n: number, build: (i: number, step: number) => ReactNode) => Array.from({ length: n }, (_, i) => build(i, 40 / n));

const DRAWINGS: Record<string, ReactNode> = {
  p1: stripes(4, (i, s) => <rect key={i} x={i * s} width={s / 2} height="40" />),
  p2: stripes(4, (i, s) => <rect key={i} y={i * s} width="40" height={s / 2} />),
  p3: <path d="M-10 10 10-10h10L-10 20ZM-10 30 30-10h10L-10 40ZM0 40 40 0v10L10 40ZM20 40 40 20v10L30 40Z" />,
  p4: stripes(16, (i) => ((i % 4) + Math.floor(i / 4)) % 2 === 0 ? <rect key={i} x={(i % 4) * 10} y={Math.floor(i / 4) * 10} width="10" height="10" /> : null),
  p5: stripes(16, (i) => <circle key={i} cx={(i % 4) * 10 + 5} cy={Math.floor(i / 4) * 10 + 5} r="3.2" />),
  p6: <path fillRule="evenodd" d="M20 2a18 18 0 1 0 0 36 18 18 0 0 0 0-36Zm0 7a11 11 0 1 1 0 22 11 11 0 0 1 0-22Zm0 6a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />,
  p7: <path d="M0 0h20v40H0ZM20 20a0 0 0 0 0 0 0Z" />,
  p8: <path d="M0 0h20v20H0ZM20 20h20v20H20Z" />,
  p9: <path d="M15 0h10v15h15v10H25v15H15V25H0V15h15Z" />,
  p10: <path d="M0 0 10 10 20 0 30 10 40 0v8L30 18 20 8 10 18 0 8ZM0 22l10 10 10-10 10 10 10-10v8L30 40 20 30 10 40 0 30Z" />,
  p11: <path d="M20 3 37 37H3Z" />,
  p12: <path fillRule="evenodd" d="M0 0h40v40H0ZM20 7a13 13 0 1 0 0 26 13 13 0 0 0 0-26Z" />,
};

export const PATTERN_LABELS: Record<string, string> = {
  p1: 'Barres',
  p2: 'Stores',
  p3: 'Biais',
  p4: 'Damier',
  p5: 'Points',
  p6: 'Cible',
  p7: 'Moitié',
  p8: 'Quartiers',
  p9: 'Croix',
  p10: 'Zigzag',
  p11: 'Delta',
  p12: 'Hublot',
};

export function Pattern({ avatar, className }: { avatar: string; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cls('pattern', className)} aria-hidden>
      <rect width="40" height="40" fill="#fff" />
      <g fill="#000">{DRAWINGS[avatar] ?? DRAWINGS.p1}</g>
    </svg>
  );
}
