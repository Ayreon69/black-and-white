// Accueil : le titre coupé en deux, pseudo + motif, créer / rejoindre une table, entraînement, règles.
import { BookOpen, Bot, House, MessageSquare, LogIn, Plus, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS, TILES } from '../../../shared/protocol';
import { PATTERN_LABELS, Pattern } from '../components/Pattern';
import { Button, Logo, Tile } from '../components/Ui';
import { cls } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('bw:url', sync);
    return () => window.removeEventListener('bw:url', sync);
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <main className="home">
      <div className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=bw">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </div>
      <header className="home-hero">
        <Logo size="lg" />
        <div className="home-tiles" aria-hidden>
          {TILES.map((t, i) => (
            <span key={t} style={{ animationDelay: `${i * 0.07}s` }}>
              <Tile value={t} size="sm" />
            </span>
          ))}
        </div>
        <p className="tagline">Neuf tuiles. Seule la couleur se voit. Le reste, tu dois t'en souvenir.</p>
      </header>

      <section className="home-panel">
        {invited && (
          <div className="invite-banner">
            Tu es attendu à la table <b>{invited}</b>. Choisis un pseudo et entre.
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Ébène"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label">Ton motif</span>
        <div className="avatar-picker" role="radiogroup" aria-label="Ton motif">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={PATTERN_LABELS[a]} title={PATTERN_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              <Pattern avatar={a} />
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <div className="train-row">
              <Button icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bot', () => createRoom({ bots: 1, autostart: true }))}>
                {busy === 'bot' ? 'Préparation…' : 'Duel contre un bot'}
              </Button>
              <Button icon={<Trophy size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots: 7, autostart: true }))}>
                {busy === 'bots' ? 'Préparation…' : 'Tournoi à 8'}
              </Button>
            </div>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 1 minute
        </Button>
        {conn !== 'online' && (
          <p className="wake-note">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </section>

      <footer className="home-foot">
        D'après le jeu de l'émission coréenne <i>The Genius</i>. Création de fans, non officielle.
      </footer>
    </main>
  );
}
