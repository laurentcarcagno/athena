# Journal de la tâche T-0085

## Fait
- Table `baseline_doc_node` (migration 043) : à la création d'une baseline, titre et empreinte de chaque exigence indexée sont figés avec le SHA de chaque source (`doc_shas`).
- `BaselineService.create` **bloque l'écart silencieux** : une source indexée depuis un dépôt (`repo_path`, `ref`) dont la tête a avancé, ou dont le dépôt est introuvable, refuse la baseline (409 avec la liste « source : indexé à X, dépôt à Y ») ; aucune ligne ni étiquette n'est créée. Les sources sans dépôt (indexées à la main) ne sont pas contrôlées.
- `docDiff` (sans GitLab) : exigences ajoutées, modifiées, supprimées par source et SHA de départ et d'arrivée ; `diff()` l'inclut (`docs`) ; `diffCsv` + route `GET /v1/projects/:p/baselines-diff/export` (cellules protégées contre les formules, mention de protection de l'instance posée par le contrôleur).
- Interface : `BaselineCompare.tsx` dans la page Planification, onglet « Baselines » (liste avec SHA par source, comparaison, export CSV).
- Tests : `baseline-docs.test.ts` (5 : enregistrement, blocage, comparaison dans les deux sens, CSV avec mention, listes d'ayants droit), `baselines.test.ts` adapté, `web25.test.tsx` (4 dont axe).

## Écarts
- Aucun. La fiche cite `PlanningTab.tsx` : la page Planification du dépôt est `ProjectManagePage.tsx`, où l'onglet est ajouté.
