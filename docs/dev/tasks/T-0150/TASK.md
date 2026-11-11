# T-0150 : Board, Backlog et Roadmap plus directs

- **Objectif** : ouvrir directement un board, des messages exacts dans le Backlog, une frise datée dans la Roadmap (revue d'ergonomie, O6, O7, O8 ; ADR-0005 § 2.2).
- **Critères d'acceptation** : Board ouvre le dernier board consulté, index en cartes, « Tous les boards » ; burndown à venir annoncé, dates en clair, action pour planifier ; frise avec mois, versions nommées et repère du jour ; tests web ; e2e board, backlog, roadmap verts.
- **Fichiers** : `apps/web/src/pages/{BoardPage,BacklogPage,RoadmapPage}.tsx`, `pages/tracker/TrackerScreen.tsx`, `components/ReleaseCharts.tsx` (`Timeline`), `lib/dates.tsx`, `i18n.ts`, tests ; `packages/ui/src/styles/views.css` ; `e2e/tests/board.spec.ts`.
