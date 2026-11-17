# T-0209 : journal d usage agrégé (B26, KPI 6)

- Migration 074 `portfolio_usage` (jour, rôle, route, compteur : aucune identité, aucun projet, aucun contenu). `ppm/usage.service.ts` : `hit` (ne lève jamais), `report`, `usageRole` (rôle PPM le plus élevé). Compté sur les lectures de portefeuille (liste, synthèses, détail, santé, export CSV). `GET /v1/portfolios/usage?days=` (admin, PMO) : requête de KPI.
- Tests : `ppm/usage.test.ts` (colonnes de la table figées). Colonne nommée `usage_day` : `day` est refusé par PostgreSQL dans cette position.
