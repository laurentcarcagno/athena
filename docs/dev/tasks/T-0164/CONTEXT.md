# Journal de la tâche T-0164

## Fait
- Migration 060 `baseline_schedule` (clé du ticket, début nul pour un jalon, fin) ; `BaselineService.create` reçoit un instantané (`ScheduleService.snapshot`, branché dans `core.module`) et l'écrit avec la baseline. Les baselines existantes n'ont pas de planning figé (elles n'apparaissent pas dans la liste de comparaison).
- `GET /v1/projects/:p/schedule?baseline=NOM` : chaque tâche reçoit `baselineStart`, `baselineEnd` et `variance` (jours ouvrés, fin planifiée − fin figée, positif = retard) ; `baseline` en tête. `GET /schedule/baselines` liste les baselines qui ont figé un planning. Une baseline inconnue : 404.
- Gantt : `critical` (barres et liens épais en jeton de danger + étiquette « Critique » dans le tableau, y compris pour les tâches parentes sans marge) ; calque de baseline en pointillés sous la barre (infobulle des dates figées), colonne « Écart » (« +2 j », « −1 j », « 0 j », infobulle en toutes lettres).
- `PlanningPage` : interrupteur « Chemin critique » (`?critique=1`) et sélecteur « Comparer à une baseline » (`?baseline=`), tous deux dans l'adresse ; explication affichée sous la barre d'outils.
- Tests : API 33 (instantané, comparaison, baseline inchangée, GitLab réel) ; web `planning-baseline.test.tsx` (9).

## Décisions
- Le rouge seul ne porte rien : trait épais + mention texte ; le calque de baseline est en pointillés gris, l'écart est écrit.
- Les dates figées sont les dates planifiées calculées (pas les dates saisies).
