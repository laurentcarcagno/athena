# T-0156 : cartes graphiques sur une recherche

- **Objectif** : des cartes graphiques à ajouter soi-même (demande du second tour : « d'autres widgets comme des camemberts », choix laissé à l'équipe ; ADR-0005 § 2.3).
- **Critères d'acceptation** : anneau, barres, indicateur sur une recherche ; `GET /v1/search/facets` (comptes par champ, mêmes droits que la recherche, « Autres » au-delà de 7 valeurs) ; tests API et web ; e2e : ajouter un anneau par statut.
- **Fichiers** : `apps/api/src/atql/search.{service,controller}.ts`, `atql/atql.test.ts`, `core/dashboard.{service,test}.ts` ; `apps/web/src/components/ChartCard.tsx`, `components/Dashboard.tsx`, `i18n.ts`, `chart-card.test.tsx` ; `packages/ui/src/styles/containers.css` ; `e2e/tests/ergonomie.spec.ts`.
