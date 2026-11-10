# T-0115 : Backlog, côté API (Lot 9, E1)

## Fait (2026-11-10)
- Migration 048 `backlog_rank` : rang à part du ticket, donc sans révision ni commit. RLS de l'organisation et politique restrictive des ayants droit (`acl_allows`, `acl_artifact_ok`).
- `agile/backlog.service.ts` :
  - `list` : tickets non terminés des trackers `type_key = 'task'`, hors sprint en cours ou planifié, triés par rang, puis par création et `id` (ordre stable). Titre, points et responsable passent par les rôles sémantiques et les droits de lecture par champ ;
  - `rank(key, after)` : place le ticket après `after` (`null` : en tête), puis réécrit les rangs de 1024 en 1024 là où ils changent. Chaque appel est audité.
- Routes :
  - `GET /v1/projects/:p/backlog` renvoie `{ items }` ;
  - `POST /v1/projects/:p/backlog/rank` (`{ key, after }`) est réservée à l'administrateur et au chef du projet (`requireManager`).
- `tools/dev-start.mjs`, `seedAgile` (idempotent) : projet NOVA, tracker Tâches (type `task`) avec 8 tickets, Sprint 1 actif (3 tickets), Sprint 2 planifié (1 ticket), backlog classé. Vérifié sur la base `athena_dev` : 4 tickets au backlog, 403 pour `user.dev` sur le réordonnancement.
- Tests : `backlog.test.ts` (7) couvre l'ordre stable, le réordonnancement, les refus, les sprints, les tickets terminés, les droits par champ, la RLS entre organisations et la liste d'ayants droit.

## Décisions et pièges
- Un ticket qui sort d'un sprint clos revient au backlog avec son ancien rang.
- Un nouveau ticket, sans rang, se range en fin de backlog.
- Le port 3002 (santé du worker) était occupé au premier lancement de `dev-start` ; il était libre après l'arrêt.

## Prompt de reprise
T-0116 (page Backlog : backlog ordonné, sprints, ajouter ou retirer, démarrer, clore, burndown).
