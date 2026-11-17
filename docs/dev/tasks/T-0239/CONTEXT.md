# T-0239 à T-0241 : gouvernance V2, API (B38)

- Migration 081 : `portfolio_decision` (poursuivre, suspendre, arrêter, clôturer, changement chiffré ; acl_read), `portfolio_project.kind` (delivery ou pilot) et `purpose`.
- `ppm/decision.service.ts` : suspendre, arrêter et clôturer **proposent** une transition du cycle de vie sans l appliquer ; un changement chiffré s applique en avenant de budget (finance et administrateur), une seule fois ; journal filtrable ; enregistrement par le PMO et l administrateur.
- Projet de pilotage : exclu de la santé, de la roadmap et du tableau de passage ; ses risques et actions entrent dans la matrice et le suivi.
- `ppm/alert.service.ts` : centre d alertes calculé à la lecture (revue en retard, critique depuis deux instantanés, dépassement budgétaire, surcharge) ; s ouvre et se résout seul.
- Routes `GET|POST /v1/portfolios/:k/decisions`, `POST …/decisions/:id/apply`, `GET …/alerts`. Tests : `ppm/decision.test.ts`.
- Non fait : notification de l échéance d une décision au responsable (le mécanisme existe, pas branché).
