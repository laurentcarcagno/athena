# T-0234 à T-0236 : finances, API (B37)

- Rôle `athena-finance` (realm de développement, utilisateur finance.dev, `dev-start`). Migration 080 : catégories, budget (ajout seul), engagements, réels, prévisions, import (empreinte unique), taux des ressources ; politiques `acl_read` sur les tables de projet.
- `ppm/finance.service.ts` : budget courant = initial + avenants + arbitrages ; EAC = réel + prévisions des mois à venir ; alertes `exceeded` (réel au-delà du budget) et `overrun` (EAC au-delà) ; courbe cumulée ; import CSV idempotent (997 enregistrées, 3 rapportées sur 1 000 lignes dont 3 erronées) ; taux et coût du temps passé réservés à la finance et à l administrateur. Lecture : finance, administrateur, PMO, direction. Routes `/v1/finance/*`, interrupteur `ppm.finance`.
- Tests : `ppm/finance.test.ts` (droits, calculs, ajout seul, import, taux, visibilité).
