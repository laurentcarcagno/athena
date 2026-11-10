# T-0118 : API de recherche globale (Lot 9, G1)

Critère : un ticket d'un projet non autorisé n'apparaît jamais.

## Fait (2026-11-10)
- `atql/search.service.ts` : `searchOrganization(org, q, utilisateur, { projects, limit, offset, roles })`, même ATQL que la recherche de projet, sur toute l'organisation ou sur une liste de projets. La recherche de projet passe par le même moteur (`run`), avec un périmètre d'un projet.
  - Champs à lecture restreinte indexés par `PROJET/TRACKER` (une clé de tracker n'est unique que dans son projet).
  - Chaque résultat porte désormais `project` et `title` (champ de rôle `title`, ou la clé s'il est absent ou masqué) : ajout compatible.
- `atql/search.controller.ts` : `GET /v1/search?q=&project=A,B&limit&offset`.
- Droits : les listes d'ayants droit (RLS restrictive sur `project`, `tracker`, `artifact`, appliquée par `Db.tx` avec le sujet) écartent les projets non autorisés ; l'isolation d'organisation reste celle de la RLS. Clés de projet validées (`^[A-Z][A-Z0-9]{1,9}$`, 50 au plus).
- ATQL : champ natif `category` (`todo`, `in_progress`, `done`), commun à tous les trackers, pour la puce « Ouverts » de T-0119 (`category != done`) ; proposé aussi dans l'autocomplétion de la recherche de projet.
- Recherches enregistrées (migration 049 `saved_search`, `saved-search.service.ts`) : personnelles, hors projet, requête ATQL + périmètre de projets ; `GET/POST /v1/searches`, `DELETE /v1/searches/:id` (propriétaire seulement, sinon `not_found`). Base des vues enregistrées de la page globale.
- Test : `saved-search.test.ts` ; `atql.test.ts` (`category`) ; `access.test.ts`, « recherche globale (T-0118) » : projet à liste invisible même nommé (`project = SEC`, `key = SEC-REQ-0001`, `project=SEC`), membre de la liste, autre organisation, erreurs de validation.

## Prompt de reprise
T-0119 (page Recherche globale, palette sur tous les projets).
