# T-0196 : test d architecture des politiques RLS (B14)

- `apps/api/src/db/rls-architecture.test.ts` : analyse des migrations (sans base) ; toute table créée avec `project_id` ou `artifact_id` doit avoir une politique `acl_read` (y compris celles posées en boucle par `execute format`). Cas témoin intégré. Deux exceptions justifiées : `access_list`, `export_control_member` (sources de vérité de `acl_allows`).
- Tests : 3 verts.
