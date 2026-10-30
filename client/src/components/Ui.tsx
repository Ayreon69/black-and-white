// Briques d'interface communes : boutons, fenêtres, logo, tuile, motif et réactions.
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { colorOf, type Color, type PlayerView } from '../../../shared/protocol';
import { cls } from '../lib/util';
import { useStore } from '../store';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Black & White">
      <span className="logo-b">Black</span>
      <i className="logo-and">&amp;</i>
      <span className="logo-w">White</span>
    </div>
  );
}

/** Une tuile : avec un chiffre, ou face cachée, où seule sa couleur se voit. */
export function Tile({ value, color, size = 'md', className }: { value?: number | null; color?: Color | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const known = value !== undefined && value !== null;
  const c = known ? colorOf(value) : color;
  if (!c) return <span className={cls('tile', `tile-${size}`, 'is-empty', className)} aria-label="Aucune tuile" />;
  return (
    <span className={cls('tile', `tile-${size}`, `is-${c}`, !known && 'is-hidden', className)} aria-label={known ? `Tuile ${value}, ${c === 'black' ? 'noire' : 'blanche'}` : `Tuile ${c === 'black' ? 'noire' : 'blanche'}`}>
      {known && value}
    </span>
  );
}

interface SegmentedOption<T> {
  value: T;
  label: string;
}

export function Segmented<T extends string | number>({ options, value, onChange, disabled, label }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} disabled={disabled} className={cls('seg', o.value === value && 'is-on')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div className="modal" role="dialog" aria-modal="true" aria-label={title} initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 30 }} transition={{ duration: 0.18 }} onClick={(e) => e.stopPropagation()}>
            <header className="modal-head">
              <h2>{title}</h2>
              <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
                <X size={20} />
              </button>
            </header>
            <div className="modal-body">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Les réactions passent en bas de l'écran, avec le nom de leur auteur, puis s'effacent. */
export function EmoteLayer({ players }: { players: PlayerView[] }) {
  const emotes = useStore((s) => s.emotes);
  return (
    <div className="emote-layer" aria-live="polite">
      <AnimatePresence>
        {emotes.map((e) => (
          <motion.div key={e.id} className="emote-line" initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <b>{players.find((p) => p.id === e.playerId)?.name ?? '?'}</b> {e.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
