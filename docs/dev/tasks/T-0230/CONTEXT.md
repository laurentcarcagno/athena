# T-0230 : temps passé (B36)

- Migration 078 `worklog` (personne, ticket, jour, minutes ; politique restrictive `acl_artifact_ok`). `ppm/worklog.service.ts` : saisie pour soi (l administrateur corrige pour un autre), retrait du sien, temps d un ticket, planifié (allocations) contre consommé par période et par personne. Routes `GET|POST /v1/projects/:p/artifacts/:key/worklog`, `DELETE …/worklog/:id`, `GET …/planned-vs-consumed` (interrupteur `ppm.capacity`).
- Tests : `ppm/worklog.test.ts`. Piège : `day` sans `as` est refusé comme alias SQL.
