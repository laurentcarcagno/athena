# T-0218 : instantanés de portefeuille (B32)

- Migration 075 : `portfolio_snapshot` (type weekly, monthly, review, manual ; période unique par portefeuille pour les périodiques), `portfolio_snapshot_line` (valeurs figées par projet ; politique restrictive `acl_read`), `portfolio_review` (utilisée en T-0221).
- `ppm/snapshot.service.ts` : `take` (idempotent par période), `list`, `get` (totaux recalculés sur les lignes visibles), `compare`, `previous`, `series`, `purge` (rétention des périodiques et manuels ; revues sans limite par défaut ; un instantané référencé par une revue est conservé).
- Routes : `GET|POST /v1/portfolios/:k/snapshots`, `GET …/snapshots/:id`, `GET …/snapshots/compare?a&b`, `GET …/trend`. Instantané manuel : admin et PMO.
- Tests : `ppm/snapshot.test.ts` (période, idempotence, visibilité, comparaison, purge).
