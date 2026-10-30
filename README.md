# Black & White

**Neuf tuiles. Seule la couleur se voit. Le reste, tu dois t'en souvenir.**

Jeu multijoueur en ligne de déduction et de bluff, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après le jeu de l'émission coréenne *The Genius* (projet de fans, non officiel, avec ses propres visuels).

## Règles en bref

- Chacun a neuf tuiles de 0 à 8. Les paires sont noires, les impaires blanches.
- Le premier pose une tuile : son adversaire n'en voit que la couleur. Le second répond.
- La plus haute marque un point. On annonce le gagnant, jamais les chiffres.
- Le gagnant ouvre la manche suivante. Sur deux tuiles égales, personne ne marque et l'ordre ne change pas.
- Le plus de points après neuf manches gagne. À égalité, neuf nouvelles tuiles.

Les sources confirment les tuiles, les couleurs, ce qui est révélé, qui ouvre et la prolongation. Sont des choix de ce jeu : le tirage de qui ouvre la première manche (l'émission utilise les jetons de chacun), l'arrêt dès que l'écart ne peut plus être comblé, le tirage au sort après trois séries nulles et le tournoi à élimination directe de 3 à 8 joueurs.

## Fonctionnalités

- Duel à 2, ou tournoi jusqu'à 8 avec exemptions, chaque tour se jouant en même temps
- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Bots qui déduisent à partir des seules couleurs et des résultats, sans jamais voir une tuile adverse
- Aucune aide à la mémoire : ni couleurs passées, ni historique, ni décompte des tuiles adverses. Le serveur n'envoie d'un duel que la manche en cours
- Tous les chiffres révélés à la fin de chaque duel
- Reprise automatique après une coupure, pilote automatique si un joueur s'absente, observateurs
- Sons synthétisés et vibrations

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3060
npm run dev:client   # interface sur http://localhost:5177
npm test             # moteur de jeu, tableau, bots et secrets
npm run build && npm run e2e   # tournoi complet avec de vrais clients connectés
```

`BW_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur
- `server/` : Express + Socket.IO, duel (`duel.ts`), tableau (`bracket.ts`), bots (`bots.ts`), table et minuteries (`room.ts`). Le serveur fait autorité : un chiffre ne sort que vers celui qui l'a posé, jusqu'à la fin du duel
- `client/` : React + Vite. Le plateau et le tableau sont dans `screens/Table.tsx`, la révélation dans `screens/Final.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
