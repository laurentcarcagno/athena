# T-0162 : Planning et Gantt en lecture

- **Objectif** : le Planning remplace la Roadmap au rail (`/p/:p/planning`, redirection de `/roadmap`) ; vue Gantt en lecture (tableau WBS, barres avec avancement, jalons, repère du jour, jours non ouvrés, liens) ; onglet Versions = l'ancienne Roadmap.
- **Critères d'acceptation** (testables) : test web du rendu ; e2e : barres aux bonnes dates, redirection `/roadmap` ; axe sur le Gantt (9 thèmes × 2 modes) ; rayon des barres = jeton du thème ; fenêtrage à 500 lignes.
- **Fichiers concernés** : `pages/PlanningPage.tsx`, `components/ScheduleGantt.tsx`, `lib/schedule.ts`, `lib/navigation.ts`, `packages/ui/src/styles/views.css`, `e2e/tests/planning.spec.ts`.
- **Hors périmètre** : édition (T-0163), chemin critique affiché et baselines (T-0164), Board et Liste (T-0165).
- **Dépendances** : T-0161.
