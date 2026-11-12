# T-0164 : chemin critique et baselines de planning

- **Objectif** : interrupteur du chemin critique (jeton de danger, trait épais, mention « Critique ») ; la baseline mémorise les dates planifiées (migration 060), calque en pointillés, écart en jours.
- **Critères d'acceptation** (testables) : dates figées dans la baseline (API) ; tests web ; aucune information portée par la couleur seule.
- **Fichiers concernés** : migration 060, `history/baseline.service.ts`, `planning/schedule.service.ts`, `components/ScheduleGantt.tsx`, `pages/PlanningPage.tsx`.
- **Dépendances** : T-0163.
