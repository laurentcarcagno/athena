# T-0143 : onglets visibles et défilants

- **Objectif** : rendre les onglets des rapports visibles et cliquables, et garder la fiche à la largeur de l'écran sur téléphone (revue d'ergonomie, B2 et B3 ; ADR-0005 § 2.1).
- **Critères d'acceptation** : onglets des rapports sous l'en-tête, titre = rapport ouvert ; à 390 px la largeur du document ne dépasse pas l'écran sur la fiche, les onglets défilent dans leur rangée ; e2e.
- **Fichiers** : `apps/web/src/pages/ReportsPage.tsx`, `DashboardPage.tsx`, `project/{Activity,Code,Conformity,Traceability}Tab.tsx` ; `packages/ui/src/styles/mobile-charts.css` ; `e2e/tests/ergonomie.spec.ts`.
