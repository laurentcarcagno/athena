# T-0223 : passage des gates, matrice des risques, suivi des actions (B34)

- API : `GET /v1/portfolios/:k/gates`, `/risks`, `/actions` (`ppm/governance.service.ts`), tout sous l identité du lecteur (aucune trace d un projet masqué : test). Matrice : risques ouverts avec rôles probabilité et impact (champs à lecture restreinte exclus), dix plus critiques. Actions : tickets de type action, en retard = échéance dépassée.
- Web : `GovernancePanel` (tableau de passage, matrice 5 x 5 avec palier en toutes lettres, tableau des actions, tendance). Tests : `governance.test.ts`, `GovernancePanel.test.tsx`.
