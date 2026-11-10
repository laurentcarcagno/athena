# T-0121 : Rapports et redirections (Lot 9, H2)

Critère : toute ancienne URL mène à la nouvelle page ; rail du projet ≤ 9 entrées.

## Fait (2026-11-10)
- `pages/ReportsPage.tsx` : `/p/:p/rapports` (premier rapport affiché), `/rapports/:r` avec Avancement (`DashboardPage`), Traçabilité, Conformité, Livraison (`CodeTab`, DORA), Activité. Sous-navigation en puces (`aria-current`).
- `REPORTS` et `visibleReports(modules)` dans `lib/navigation.ts` : un rapport dont le module est inactif n'est ni listé ni accessible (retour au premier rapport) ; modules inconnus : tous visibles.
- Rail : section `reports` ; Traçabilité, Conformité, Code et intégration, Activité en sortent. Administrateur : 9 entrées (Vue d'ensemble, Backlog, Board, Trackers, Roadmap, Rapports, Documents, Recherche, Paramètres).
- Redirections : `/tracabilite`, `/conformite`, `/code`, `/activite` → `/rapports/...` (`code` → `livraison`). `placeOf` et le fil d'Ariane suivent.
- Tests : `navigation.test`, `web9` (Rapports), `web11`, `web16`, `web17`, `mobile-nav` ; e2e `audit`, `navigation`, `no-egress`. Vitest 402/402, e2e 43/43, tsc et lint-design OK.

## Prompt de reprise
T-0122 (tableau de bord configurable, migration 050).
