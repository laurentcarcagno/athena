# T-0043 : automatisations planifiées

- Migration 023 (schedule_minutes, last_run_at). Déclencheur `schedule` + `everyMinutes` (5 à 10080) + condition ATQL obligatoire ; 100 artefacts max par passage ; quota horaire par artefact conservé.
- ATQL : `daysAgo(n)` (0 à 3650).
- Le worker exécute `runDue` dans la boucle des automatisations.
