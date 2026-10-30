// La fin : le vainqueur, le classement, et enfin tous les chiffres, duel par duel, tuile par tuile.
import confetti from 'canvas-confetti';
import { LogOut, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { roundName, type RoomView, type SlotView } from '../../../shared/protocol';
import { Pattern } from '../components/Pattern';
import { Button, Logo, Tile } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls } from '../lib/util';
import { leaveRoom, send } from '../net';

const FLIP_MS = 420;

function Reveal({ view, slot, open, onToggle }: { view: RoomView; slot: SlotView; open: boolean; onToggle: () => void }) {
  const d = slot.duel!;
  const turns = d.turns ?? [];
  const name = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '?';
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!open) return;
    setShown(0);
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm) {
      setShown(turns.length);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(i);
      sfx.flip();
      if (i >= turns.length) clearInterval(id);
    }, FLIP_MS);
    return () => clearInterval(id);
  }, [open, turns.length]);

  return (
    <section className={cls('reveal', open && 'is-open')}>
      <button type="button" className="reveal-head" aria-expanded={open} onClick={onToggle}>
        <span className="reveal-round">{roundName(slot.round, view.bracket.length)}</span>
        <span className="reveal-names">
          <span className={slot.winner === slot.a ? 'is-win' : ''}>{name(slot.a)}</span> {d.scoreA} – {d.scoreB} <span className={slot.winner === slot.b ? 'is-win' : ''}>{name(slot.b)}</span>
        </span>
      </button>
      {open && (
        <div className="reveal-grid">
          <p className="reveal-col-names">
            En haut : {name(slot.a)}. En bas : {name(slot.b)}.
          </p>
          {turns.map((t, i) => (
            <div key={`${t.set}-${t.turn}`} className={cls('reveal-turn', t.turn === 1 && t.set > 1 && 'is-newset')}>
              <span className={cls('reveal-tile', i < shown && 'is-up', t.winner === slot.a && 'is-win', t.winner === slot.b && 'is-lose')}>
                <Tile value={i < shown ? t.a : undefined} color={t.a % 2 === 0 ? 'black' : 'white'} size="sm" />
              </span>
              <span className={cls('reveal-tile', i < shown && 'is-up', t.winner === slot.b && 'is-win', t.winner === slot.a && 'is-lose')}>
                <Tile value={i < shown ? t.b : undefined} color={t.b % 2 === 0 ? 'black' : 'white'} size="sm" />
              </span>
            </div>
          ))}
        </div>
      )}
      {open && d.decidedBy === 'lot' && <p className="reveal-note">Trois séries nulles : le sort a tranché.</p>}
    </section>
  );
}

export function Final({ view }: { view: RoomView }) {
  const final = view.final ?? [];
  const champion = final[0];
  const won = champion?.id === view.me;
  const played = useMemo(() => view.bracket.flat().filter((s) => s.duel?.turns), [view.bracket]);
  // Ton dernier duel d'abord : c'est celui dont tu veux connaître les chiffres.
  const myLast = [...played].reverse().find((s) => s.a === view.me || s.b === view.me) ?? played[played.length - 1];
  const [open, setOpen] = useState<string | null>(myLast?.id ?? null);
  const isHost = view.me === view.hostId;

  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (!won) return;
    sfx.champion();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      void confetti({ particleCount: 140, spread: 90, origin: { y: 0.3 }, colors: ['#000000', '#ffffff'], disableForReducedMotion: true });
    }
  }, [won]);

  return (
    <main className="final">
      <header className="final-hero">
        <Logo size="sm" />
        {champion && (
          <>
            <Pattern avatar={champion.avatar} className="final-pattern" />
            <h1>{won ? 'Tu gagnes.' : `${champion.name} gagne.`}</h1>
          </>
        )}
      </header>

      {final.length > 2 && (
        <ol className="ranking">
          {final.map((f) => (
            <li key={f.id} className={cls(f.id === view.me && 'is-me')}>
              <b>{f.rank}</b>
              <Pattern avatar={f.avatar} />
              <span>{f.name}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="reveals">
        <h2>Les chiffres, enfin</h2>
        {[...played].reverse().map((s) => (
          <Reveal key={s.id} view={view} slot={s} open={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)} />
        ))}
      </div>

      <div className="final-actions">
        {isHost ? (
          <Button variant="primary" className="btn-lg" icon={<RotateCcw size={18} />} onClick={() => void send('game:restart')}>
            Rejouer
          </Button>
        ) : (
          <p className="wait-note">L'hôte peut relancer une partie.</p>
        )}
        <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
          Quitter la table
        </Button>
      </div>
    </main>
  );
}
