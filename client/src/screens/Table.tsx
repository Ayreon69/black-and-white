// La partie : ton duel en plein écran, ou le tableau et les autres duels quand tu n'as rien à jouer.
import { BookOpen, LogOut, MessageCircle, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOTES, TAUNTS, TURNS_PER_SET, roundName, type DuelView, type PlayerView, type RoomView, type SlotView } from '../../../shared/protocol';
import { Pattern } from '../components/Pattern';
import { Button, EmoteLayer, Tile } from '../components/Ui';
import { sfx } from '../lib/sound';
import { cls, secondsLeft, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore } from '../store';

/** La ligne entre le noir et le blanc suit le score : chaque point d'écart la pousse chez le perdant. */
function splitFor(gap: number, compact: boolean): number {
  // Sur un petit écran, la main prend de la place : la ligne remonte et bouge moins.
  const small = compact && window.innerHeight < 620;
  const reach = small ? 2 : 4;
  const clamped = Math.max(-reach, Math.min(reach, gap));
  return (small ? 36 : compact ? 44 : 47) + clamped * 2;
}

function TopBar({ view, onBracket }: { view: RoomView; onBracket?: () => void }) {
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.me === view.hostId;
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="topbar">
      <span className="topbar-round">{roundName(view.roundIndex, view.bracket.length)}</span>
      <div className="topbar-actions">
        {onBracket && (
          <button type="button" className="icon-btn" onClick={onBracket}>
            Tableau
          </button>
        )}
        <button type="button" className="icon-btn" aria-label="Les règles" onClick={() => setRulesOpen(true)}>
          <BookOpen size={18} />
        </button>
        <button type="button" className="icon-btn" aria-label={prefs.sound ? 'Couper le son' : 'Activer le son'} onClick={() => setPrefs({ sound: !prefs.sound })}>
          {prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        {confirm ? (
          <>
            <button type="button" className="icon-btn" onClick={() => (isHost ? void send('game:end') : void leaveRoom())}>
              {isHost ? 'Arrêter ?' : 'Quitter ?'}
            </button>
            <button type="button" className="icon-btn" aria-label="Annuler" onClick={() => setConfirm(false)}>
              <X size={18} />
            </button>
          </>
        ) : (
          <button type="button" className="icon-btn" aria-label={isHost ? 'Arrêter la partie' : 'Quitter la table'} onClick={() => setConfirm(true)}>
            <LogOut size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function Taunts() {
  const [open, setOpen] = useState(false);
  const say = (emoji: string) => {
    socket.emit('emote', { emoji });
    setOpen(false);
  };
  return (
    <div className="taunts">
      {open && (
        <div className="taunts-menu">
          <div className="taunts-emoji">
            {EMOTES.map((e) => (
              <button key={e} type="button" onClick={() => say(e)}>
                {e}
              </button>
            ))}
          </div>
          {TAUNTS.map((t) => (
            <button key={t} type="button" className="taunt-line" onClick={() => say(t)}>
              {t}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="icon-btn taunts-toggle" aria-label="Provoquer" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MessageCircle size={18} />
      </button>
    </div>
  );
}

/** Une phrase, pas plus : ce qui se passe maintenant. Rien sur ce qui s'est passé avant. */
function statusLine(d: DuelView, me: string | null, opponent: string, nameOf: (id: string) => string, handLeft: number): string {
  const isPlayer = me !== null;
  const color = d.leadColor === 'black' ? 'noire' : 'blanche';
  if (d.phase === 'done') return isPlayer ? '' : 'Duel terminé.';
  if (d.phase === 'result') {
    if (d.turnWinner === null) return 'Égalité. Personne ne marque.';
    if (d.turnWinner === me) return 'Ta tuile est plus haute.';
    return isPlayer ? 'Sa tuile est plus haute.' : `${nameOf(d.turnWinner)} marque.`;
  }
  const leaderIsMe = d.leader === me;
  if (d.phase === 'lead') {
    if (leaderIsMe) return handLeft === 1 ? 'Ta dernière tuile se pose seule.' : 'À toi de commencer.';
    return `${nameOf(d.leader)} choisit sa tuile.`;
  }
  if (!isPlayer) return `Tuile ${color} posée.`;
  if (leaderIsMe) return `Tu as posé. ${nameOf(opponent)} répond.`;
  return handLeft === 1 ? `Tuile ${color}. Ta dernière se pose seule.` : `Tuile ${color}. À toi de répondre.`;
}

function DuelBoard({ view, slot, me }: { view: RoomView; slot: SlotView; me: string | null }) {
  const d = slot.duel!;
  const now = useTick(250);
  // Toi en bas sur le blanc, ton adversaire en haut sur le noir. Spectateur : le joueur A en bas.
  const bottomId = me ?? slot.a!;
  const topId = bottomId === slot.a ? slot.b! : slot.a!;
  const player = (id: string) => view.players.find((p) => p.id === id) as PlayerView;
  const nameOf = (id: string) => player(id)?.name ?? '?';
  const bottomScore = bottomId === slot.a ? d.scoreA : d.scoreB;
  const topScore = topId === slot.a ? d.scoreA : d.scoreB;
  const hand = view.hand ?? [];
  const canPlay = !!me && ((d.phase === 'lead' && d.leader === me) || (d.phase === 'follow' && d.leader !== me)) && hand.length > 1;
  const [picked, setPicked] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const compact = !!me;

  const leaderIsBottom = d.leader === bottomId;
  const bottomColor = leaderIsBottom ? d.leadColor : d.followColor;
  const topColor = leaderIsBottom ? d.followColor : d.leadColor;
  const isResult = d.phase === 'result';
  const seconds = Math.min(secondsLeft(d.endsAt, now), view.settings.turn);
  const showClock = (d.phase === 'lead' || d.phase === 'follow') && hand.length !== 1;

  useEffect(() => {
    if (!canPlay) setPicked(null);
  }, [canPlay]);

  // Sons et vibrations à chaque changement de manche ou de phase.
  const key = `${d.set}.${d.turn}.${d.phase}`;
  const seen = useRef(key);
  useEffect(() => {
    if (seen.current === key) return;
    seen.current = key;
    if (d.phase === 'follow') {
      if (d.leader === me) sfx.place();
      else {
        sfx.yours();
        vibrate(40);
      }
    } else if (d.phase === 'result') {
      sfx.place();
      setTimeout(() => {
        if (d.turnWinner === null) sfx.draw();
        else if (!me || d.turnWinner === me) sfx.win();
        else sfx.lose();
        vibrate(d.turnWinner === me ? [30, 40, 60] : 120);
      }, 240);
    }
  }, [key, d.phase, d.leader, d.turnWinner, me]);

  useEffect(() => {
    if (canPlay && seconds > 0 && seconds <= 5) sfx.tick();
  }, [canPlay, seconds]);

  const submit = async () => {
    if (picked === null || sending) return;
    setSending(true);
    const ok = await send('game:play', { tile: picked });
    setSending(false);
    if (ok) setPicked(null);
  };

  return (
    <div className={cls('duel', isResult && 'is-result', isResult && d.turnWinner === null && 'is-draw', me && 'is-player')} style={{ '--split': `${splitFor(bottomScore - topScore, compact)}%` } as React.CSSProperties}>
      <div className="duel-field" aria-hidden />

      <div className={cls('duel-seat duel-top', d.leader === topId && 'is-leader')}>
        <Pattern avatar={player(topId)?.avatar} />
        <span className="seat-name">{nameOf(topId)}</span>
        {player(topId)?.autopilot && <span className="seat-note">absent</span>}
      </div>

      <div className="duel-stage">
        <div className="stage-side">
          <strong className={cls('score score-top', isResult && d.turnWinner === topId && 'is-up')} key={`t${topScore}`}>
            {topScore}
          </strong>
          <strong className={cls('score score-bottom', isResult && d.turnWinner === bottomId && 'is-up')} key={`b${bottomScore}`}>
            {bottomScore}
          </strong>
        </div>
        <div className="stage-tiles">
          <span key={`top-${d.set}-${d.turn}-${topColor ?? 'x'}`} className={cls('stage-slot', topColor && 'is-placed', isResult && d.turnWinner === topId && 'is-winner', isResult && d.turnWinner === bottomId && 'is-loser')}>
            <Tile color={topColor} size="lg" />
          </span>
          <span key={`bot-${d.set}-${d.turn}-${bottomColor ?? 'x'}`} className={cls('stage-slot', bottomColor && 'is-placed', isResult && d.turnWinner === bottomId && 'is-winner', isResult && d.turnWinner === topId && 'is-loser')}>
            <Tile value={me ? view.myTile : undefined} color={bottomColor} size="lg" />
          </span>
        </div>
        <div className="stage-side stage-info">
          <span className="info-top">
            {d.set > 1 && <em>Prolongation {d.set - 1}</em>}
            <b>
              {d.turn}/{TURNS_PER_SET}
            </b>
          </span>
          <span className={cls('info-bottom', showClock && seconds <= 5 && 'is-urgent')}>{showClock ? seconds : ''}</span>
        </div>
      </div>

      <div className="duel-bottom">
        <div className={cls('duel-seat duel-mine', d.leader === bottomId && 'is-leader')}>
          <Pattern avatar={player(bottomId)?.avatar} />
          <span className="seat-name">{me ? 'Toi' : nameOf(bottomId)}</span>
          {me && <Taunts />}
        </div>
        <p className="duel-status" aria-live="polite">
          {statusLine(d, me, topId, nameOf, hand.length)}
        </p>
        {me && (
          <div className="hand">
            {/* Les noires d'un côté, les blanches de l'autre : ce sont tes tuiles, tu n'as pas à les chercher. */}
            {(['black', 'white'] as const).map((c) => (
              <div key={c} className="hand-row">
                {hand
                  .filter((t) => (t % 2 === 0) === (c === 'black'))
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={cls('hand-tile', picked === t && 'is-picked')}
                      disabled={!canPlay}
                      aria-pressed={picked === t}
                      onClick={() => {
                        sfx.pick();
                        setPicked(picked === t ? null : t);
                      }}
                      onDoubleClick={() => void submit()}
                    >
                      <Tile value={t} />
                    </button>
                  ))}
              </div>
            ))}
            {hand.length > 1 && (
              <Button variant="primary" className="play-btn" disabled={!canPlay || picked === null || sending} onClick={() => void submit()}>
                {!canPlay ? 'Patiente' : picked === null ? 'Choisis une tuile' : `Poser le ${picked}`}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BracketView({ view, onWatch, watching }: { view: RoomView; onWatch?: (id: string) => void; watching?: string | null }) {
  const nameOf = (id: string | null) => (id ? view.players.find((p) => p.id === id)?.name ?? '?' : '…');
  return (
    <div className="bracket">
      {view.bracket.map((round, r) => (
        <section key={r} className={cls('bracket-round', r === view.roundIndex && 'is-now')}>
          <h3>{roundName(r, view.bracket.length)}</h3>
          <ul>
            {round.map((s) => {
              const live = s.duel && s.duel.phase !== 'done';
              const row = (id: string | null, score: number | undefined) => (
                <span className={cls('bk-player', s.winner && s.winner === id && 'is-win', s.winner && s.winner !== id && id && 'is-out', id === view.me && 'is-me')}>
                  <span className="bk-name">{nameOf(id)}</span>
                  {s.duel && <b>{score}</b>}
                </span>
              );
              return (
                <li key={s.id}>
                  <button type="button" className={cls('bk-slot', live && 'is-live', watching === s.id && 'is-watched', s.bye && 'is-bye')} disabled={!live || !onWatch} onClick={() => onWatch?.(s.id)}>
                    {row(s.a, s.duel?.scoreA)}
                    {s.bye ? <span className="bk-player is-note">exempté</span> : row(s.b, s.duel?.scoreB)}
                    {live && onWatch && <span className="bk-watch">{watching === s.id ? 'à l’écran' : 'regarder'}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Interlude({ view }: { view: RoomView }) {
  const now = useTick(250);
  const it = view.interlude!;
  const ready = it.readyIds.includes(view.me);
  const nextName = roundName(view.roundIndex + 1, view.bracket.length);
  const still = view.bracket[view.roundIndex + 1]?.some((s) => s.a === view.me || s.b === view.me);
  return (
    <main className="side-screen">
      <TopBar view={view} />
      <h1 className="side-title">{still ? 'Tu passes.' : 'Tableau'}</h1>
      <p className="side-note">
        {nextName} dans {secondsLeft(it.endsAt, now)} s. Nouveau duel, neuf nouvelles tuiles.
      </p>
      <BracketView view={view} />
      <Button variant={ready ? 'default' : 'primary'} className="btn-lg" icon={<SkipForward size={18} />} onClick={() => void send('game:next')}>
        {ready ? 'En attente des autres' : 'Je suis prêt'}
      </Button>
      <EmoteLayer players={view.players} />
    </main>
  );
}

/** Le verdict d'un duel, le temps de le lire. */
function DuelEnd({ view, slot }: { view: RoomView; slot: SlotView }) {
  const d = slot.duel!;
  const won = slot.winner === view.me;
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    if (won) sfx.champion();
    else sfx.fall();
  }, [won]);
  return (
    <div className={cls('duel-end', won ? 'is-won' : 'is-lost')}>
      <strong>{won ? 'Gagné' : 'Perdu'}</strong>
      <span>{d.decidedBy === 'lot' ? 'Trois séries nulles : le sort a tranché.' : `${Math.max(d.scoreA, d.scoreB)} à ${Math.min(d.scoreA, d.scoreB)}`}</span>
    </div>
  );
}

export function Table({ view }: { view: RoomView }) {
  const round = useMemo(() => view.bracket[view.roundIndex] ?? [], [view.bracket, view.roundIndex]);
  const mine = round.find((s) => s.duel && (s.a === view.me || s.b === view.me));
  const liveMine = mine && mine.duel!.phase !== 'done';
  const lives = round.filter((s) => s.duel && s.duel.phase !== 'done');
  const [watchId, setWatchId] = useState<string | null>(null);
  const [showBracket, setShowBracket] = useState(false);
  const watched = lives.find((s) => s.id === watchId) ?? lives[0];

  if (view.interlude) return <Interlude view={view} />;

  if (liveMine) {
    return (
      <main className="table-screen">
        <TopBar view={view} onBracket={view.bracket.length > 1 ? () => setShowBracket((b) => !b) : undefined} />
        {showBracket ? (
          <div className="side-screen in-table">
            <BracketView view={view} />
            <Button onClick={() => setShowBracket(false)}>Retour au duel</Button>
          </div>
        ) : (
          <DuelBoard view={view} slot={mine} me={view.me} />
        )}
        <EmoteLayer players={view.players} />
      </main>
    );
  }

  // Ton duel vient de finir : le verdict d'abord, puis les duels des autres.
  if (mine && mine.winner && view.bracket.length === 1) {
    return (
      <main className="table-screen">
        <DuelEnd view={view} slot={mine} />
      </main>
    );
  }

  return (
    <main className="table-screen">
      <TopBar view={view} />
      {mine && mine.winner && <DuelEnd view={view} slot={mine} />}
      {watched ? (
        <>
          {lives.length > 1 || view.bracket.length > 1 ? <BracketStrip view={view} watching={watched.id} onWatch={setWatchId} /> : null}
          <DuelBoard view={view} slot={watched} me={null} />
        </>
      ) : (
        <div className="side-screen in-table">
          <BracketView view={view} />
        </div>
      )}
      <EmoteLayer players={view.players} />
    </main>
  );
}

function BracketStrip({ view, watching, onWatch }: { view: RoomView; watching: string; onWatch: (id: string) => void }) {
  const lives = view.bracket[view.roundIndex].filter((s) => s.duel && s.duel.phase !== 'done');
  if (lives.length < 2) return null;
  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '?';
  return (
    <div className="watch-strip" role="tablist" aria-label="Duels en cours">
      {lives.map((s) => (
        <button key={s.id} type="button" role="tab" aria-selected={s.id === watching} className={cls('watch-tab', s.id === watching && 'is-on')} onClick={() => onWatch(s.id)}>
          {nameOf(s.a)} · {nameOf(s.b)}
        </button>
      ))}
    </div>
  );
}
