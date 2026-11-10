# Journal de la tâche T-0114

## Fait (2026-11-10)
- API : `board.service.ts` (carte enrichie, `trackers`, `creatable`). `agile.test.ts` : +1 test, assertions sur `creatable` et `trackers`.
- Web :
  - `pages/BoardPage.tsx` réécrit : panneau, filtres, couloirs dans l'adresse, création par colonne, `BoardIndexPage` ;
  - route `/p/:p/board` ;
  - section `board` dans `lib/navigation.ts`, le fil d'Ariane et les libellés (`fr.project.tabs.board`) ;
  - `BoardView` reçoit `session` (écran Tracker et page de board).
- Tests :
  - `board.test.tsx` (8) ;
  - listes de sections mises à jour (`web9`, `web11`, `mobile-nav`, `lib/navigation.test`, `Breadcrumb.test`) ;
  - e2e `board.spec.ts` (2).
- Vérifications : Vitest web 385 sur 385, `tsc` OK, `lint-design` OK, e2e 40 sur 40.

## Décisions et pièges
- Les J / K du panneau ne sont pas portés sur le board : ils parcourent une liste, et le board est en colonnes. La fiche agrandie depuis le board reçoit l'origine (`fromHere`) et donc précédent et suivant.
- La création par colonne utilise le premier tracker du board.

## Prompt de reprise
T-0115 (Backlog, côté API : rang des tickets Tâche, routes de lecture et de réordonnancement, données de démonstration).
