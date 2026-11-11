# T-0152 : Projets en cartes et microcopie

- **Objectif** : reconnaître et ouvrir un projet d'un coup d'œil ; plus d'étiquette inutile ni d'état en anglais (revue d'ergonomie, O11 et microcopie ; ADR-0005 § 2.2).
- **Critères d'acceptation** : une carte par projet (trackers, tickets ouverts, boards, Ouvrir, favori) ; étiquettes « Mission console » et « Traitement » retirées ; états traduits ; test de vocabulaire étendu ; e2e vert.
- **Fichiers** : `apps/web/src/pages/ProjectsPage.tsx`, `MyWorkPage.tsx`, `DashboardPage.tsx`, `i18n.ts`, `vocabulaire.test.ts`, tests ; `packages/ui/src/styles/views.css` ; `e2e/tests/{parcours,navigation}.spec.ts`.
