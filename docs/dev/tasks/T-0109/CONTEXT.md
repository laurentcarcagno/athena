# Journal de la tâche T-0109

## Fait (2026-11-10)
- `apps/web/src/lib/navigation.ts` :
  - `PROJECT_SECTIONS` dans l'ordre fixe, avec `gated` (module serveur) et `Access` (union discriminée : tout le monde, ou une liste de rôles) ;
  - `visibleSections(modules, rôles)` ; `placeOf(adresse)` donne la section et le tracker d'une adresse de projet.
- `ProjectShell.tsx` :
  - `ProjectLayout` est le parent de **toutes** les routes `/p/:p/*` ;
  - `ProjectSectionFrame` garde l'étoile du projet sur les pages de section ;
  - la barre d'onglets horizontale est supprimée.
- `Rail.tsx` :
  - la rubrique « Projet <clé> » liste les sections visibles ; les trackers sont imbriqués sous « Trackers » (niveau 1), les vues partagées sous le tracker ouvert (niveau 2) ;
  - la rubrique séparée « Trackers » est supprimée ;
  - entrée courante : le tracker sur l'écran Tracker, la fiche (clé canonique) et la configuration ; sinon la section ; board → Planification.
- Accès :
  - simple membre : ni Planification, ni Membres, ni Administration ;
  - assurance qualité : Planification ;
  - chef de projet : Planification et Membres.
- Tests :
  - `lib/navigation.test.ts` (nouveau) ;
  - `web9.test.tsx` : la coquille devient la navigation au rail, avec 8 adresses vérifiées une à une ;
  - `navigation.test.tsx`, `web11`, `web16`, `web17`, `web23` et `e2e/tests/documents.spec.ts` sont adaptés au rail.
- Vérifications : Vitest web 345 sur 345, `tsc --noEmit` OK, `lint-design` OK.

## Reste à faire
- e2e non rejoués : les ports 3000 et 3001 sont occupés par une autre pile (`ariane-*`). À rejouer en T-0125 ou dès que les ports sont libres.

## Décisions et pièges
- Pendant la transition, le rail du projet compte jusqu'à 11 entrées (pages existantes, Recherche, Administration). Il redescend à 8 avec T-0120 et T-0121 (ADR-0003 § 4).
- Mobile : la navigation du projet n'est plus visible hors du tiroir « Menu » tant que T-0110 (sélecteur de section) n'est pas faite. C'est la tâche suivante.
- Les entrées du rail sont des boutons (composant `Sidebar` d'`@athena/ui`), pas des liens : pas d'ouverture dans un nouvel onglet. C'était déjà le cas ; à traiter avec T-0110 si l'on veut des liens.
- Le dépôt n'active pas `core.hooksPath`. Les commits du lot 9 passent `-c core.hooksPath=.githooks` et l'identité `laurent.carcagno@gmail.com`.

## Commandes utiles
`cd apps/web && npx vitest run src/web9.test.tsx src/navigation.test.tsx src/lib/navigation.test.ts`

## Prompt de reprise
Lire `docs/dev/STATE.md`, `docs/dev/tasks/LOT9-PLAN.md`, puis attaquer T-0110 (mobile : sélecteur de section, barre basse globale).
