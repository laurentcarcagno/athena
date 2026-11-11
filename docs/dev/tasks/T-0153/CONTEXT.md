# Journal de la tâche T-0153

## Fait
- `@athena/ui` : `DashCard` (titre en sous-section, précision, actions, corps défilant, pied) et `DashGrid` (12 colonnes) ; largeurs S = 4, M = 6, L = 8, XL = 12 colonnes ; hauteur commune `--ath-size-dashcard` (300 px, jeton ajouté au thème de base, hérité par les 9 thèmes) ; sous 1024 px, S et M passent à la moitié et L à la pleine largeur ; sous 768 px, une colonne, hauteur libre.
- API : `size` facultatif sur chaque widget ; portée `CLÉ:avancement` (`?project=ARI&page=avancement`) pour la page Avancement (T-0155) ; migration 057 (contrainte de portée élargie, aucune colonne nouvelle : la largeur et les réglages vivent dans le JSON de la disposition).
- Web : Mon travail et Vue d'ensemble sur la grille commune (largeur par défaut S, trois cartes par rangée) ; « Tout voir » et « Voir les trackers » au pied des cartes ; sur Mon travail, les cartes Recherche, À approuver et Mentions vides se résument dans « Rien d'urgent : Mes tickets et À approuver : rien pour l'instant. » (elles réapparaissent en mode personnalisation) ; « À prendre dans vos projets » avec « Me l'assigner ».
- Tests : UI 56/56 ; API tableau de bord 5/5 (largeur, portée Avancement, migration) ; web 470/470 (`dashboard-cards.test.tsx`) ; e2e `tableau-de-bord`, `navigation`, `approbation`, `notifications` verts.

## Décisions et pièges
- Après une modification de `@athena/ui`, reconstruire le paquet (`pnpm --filter @athena/ui build`) : le web en consomme la version compilée.
- Une carte vide de Mon travail reste montée (cachée par `hidden`) : c'est ainsi qu'elle sait qu'elle est vide et peut réapparaître dès qu'un ticket arrive.
