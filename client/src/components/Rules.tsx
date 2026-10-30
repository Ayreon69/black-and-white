// Les règles en une minute, ouvrables depuis partout.
import { Tile, Modal } from './Ui';
import { useStore } from '../store';

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles en 1 minute">
      <div className="rules">
        <p className="rules-lead">Neuf tuiles chacun, de 0 à 8. Les paires sont noires, les impaires blanches.</p>
        <div className="rules-tiles" aria-hidden>
          {[0, 2, 4, 6, 8].map((t) => (
            <Tile key={t} value={t} size="sm" />
          ))}
          <span className="rules-gap" />
          {[1, 3, 5, 7].map((t) => (
            <Tile key={t} value={t} size="sm" />
          ))}
        </div>
        <ol>
          <li>Le premier pose une tuile. Son adversaire n'en voit que la <b>couleur</b>.</li>
          <li>Le second répond avec une de ses tuiles.</li>
          <li>La plus haute marque un point. On annonce le gagnant, <b>jamais les chiffres</b>.</li>
          <li>Le gagnant ouvre la manche suivante. Sur deux tuiles égales, personne ne marque et l'ordre ne change pas.</li>
          <li>Une tuile posée ne revient pas. Le plus de points après neuf manches gagne, et le duel s'arrête dès que l'écart ne peut plus être comblé.</li>
          <li>Égalité à la fin : neuf nouvelles tuiles, on continue. Après trois séries nulles, le sort tranche.</li>
        </ol>
        <p>
          <b>Rien n'est noté à ta place.</b> Les couleurs passées et les résultats, c'est à toi de t'en souvenir. Tous les chiffres sont révélés à la fin du duel.
        </p>
        <p>
          <b>À plus de deux :</b> un tournoi à élimination directe, chaque tour se jouant en même temps. Ceux qui sont sortis regardent les autres duels, sans voir un seul chiffre.
        </p>
        <p className="rules-note">Le jeu ne dit pas tout : la fin anticipée, la limite de trois séries et le format du tournoi sont des choix de cette version.</p>
      </div>
    </Modal>
  );
}
