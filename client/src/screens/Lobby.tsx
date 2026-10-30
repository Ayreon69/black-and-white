// Le salon : code et invitation, joueurs, bots, temps de réflexion, lancement.
import { BookOpen, Bot, Copy, LogOut, Play, Share2, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { MAX_PLAYERS, MIN_PLAYERS, TURN_OPTIONS, type RoomView, type TurnTime } from '../../../shared/protocol';
import { Pattern } from '../components/Pattern';
import { Button, Logo, Segmented } from '../components/Ui';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

function format(n: number): string {
  if (n < 2) return 'Il manque un adversaire.';
  if (n === 2) return 'À deux : un duel.';
  if (n <= 4) return `À ${n} : tournoi, demi-finales puis finale.`;
  return `À ${n} : tournoi, quarts, demi-finales puis finale.`;
}

export function Lobby({ view }: { view: RoomView }) {
  const isHost = view.me === view.hostId;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const url = shareUrl(view.code);
  const toast = useStore((s) => s.showToast);
  const setRulesOpen = useStore((s) => s.setRulesOpen);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Lien copié.', 'info');
    } catch {
      toast(url, 'info');
    }
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Black & White', text: `Rejoins ma table : ${view.code}`, url });
    } catch {
      /* partage annulé */
    }
  };

  return (
    <main className="lobby">
      <header className="lobby-head">
        <Logo size="sm" />
        <button type="button" className="icon-btn" aria-label="Quitter la table" onClick={() => void leaveRoom()}>
          <LogOut size={20} />
        </button>
      </header>

      <section className="lobby-code">
        <div>
          <span className="field-label">Code de la table</span>
          <strong className="code">{view.code}</strong>
          <div className="share-row">
            <Button icon={<Copy size={16} />} onClick={() => void copy()}>
              Copier le lien
            </Button>
            {'share' in navigator && <Button icon={<Share2 size={16} />} aria-label="Partager" onClick={() => void share()} />}
          </div>
        </div>
        <div className="qr" aria-hidden>
          <QRCodeSVG value={url} size={104} bgColor="#ffffff" fgColor="#000000" marginSize={2} />
        </div>
      </section>

      <section className="lobby-players">
        <div className="section-head">
          <h2>
            Joueurs {seated.length}/{MAX_PLAYERS}
          </h2>
          {isHost && seated.length < MAX_PLAYERS && (
            <Button icon={<Bot size={16} />} onClick={() => void send('room:addBot')}>
              Ajouter un bot
            </Button>
          )}
        </div>
        <ul className="player-list">
          {view.players.map((p) => (
            <li key={p.id} className={cls('player-row', !p.connected && 'is-off')}>
              <Pattern avatar={p.avatar} />
              <span className="player-name">{p.name}</span>
              {p.id === view.me && <span className="tag">toi</span>}
              {p.isBot && <span className="tag">bot</span>}
              {p.isHost && <span className="tag tag-solid">hôte</span>}
              {isHost && p.id !== view.me && (
                <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
                  <X size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="format-note">{format(seated.length)}</p>
      </section>

      <section className="lobby-settings">
        <span className="field-label">Temps pour poser une tuile</span>
        <Segmented<TurnTime> label="Temps pour poser une tuile" disabled={!isHost} value={view.settings.turn} onChange={(turn) => void send('room:settings', { turn })} options={TURN_OPTIONS.map((t) => ({ value: t, label: `${t} s` }))} />
      </section>

      <div className="lobby-actions">
        {isHost ? (
          <Button variant="primary" className="btn-lg" icon={<Play size={20} />} disabled={seated.length < MIN_PLAYERS} onClick={() => void send('game:start')}>
            {seated.length < MIN_PLAYERS ? 'En attente d’un adversaire' : 'Lancer la partie'}
          </Button>
        ) : (
          <p className="wait-note">L'hôte lance la partie quand tout le monde est là.</p>
        )}
        <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 1 minute
        </Button>
      </div>
    </main>
  );
}
