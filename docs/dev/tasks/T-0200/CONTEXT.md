# T-0200 : météo du projet (B17)

- Migration 071 `project_status_note` (ajout seul, RLS org + acl_read). `ppm/status-note.service.ts` (`list`, `write`, `worstLevel`), `GET|POST /v1/projects/:p/status-notes` (écriture : chef du projet ou admin). Délai, périmètre et risque obligatoires ; ressources et coût facultatifs.
- Carte `ProjectStatusCard` dans la vue d ensemble (niveaux en toutes lettres, saisie en trois choix).
- Tests : `ppm/status-note.test.ts`, `components/ProjectStatusCard.test.tsx`.
