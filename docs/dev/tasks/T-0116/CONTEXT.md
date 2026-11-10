# T-0116 : page Backlog (Lot 9, E2)

Critère : un sprint se planifie sans quitter la page, au clavier compris.

## Fait (2026-11-10)
- API :
  - `SprintService.removeItem` et `DELETE /v1/projects/:p/sprints/:id/items/:clé` (responsables du projet) ;
  - `close(…, moveTo?)` : `POST …/sprints/:id/close` accepte `{ moveTo }`, un sprint planifié du même projet qui reçoit les tickets non terminés ;
  - les tickets d'un sprint suivent l'ordre du backlog et portent `title` (seulement si le titre n'est pas à lecture restreinte) et `statusName` ;
  - test OpenAPI : `close` a désormais un corps ;
  - `backlog.test.ts` : +1 test.
- Web :
  - `pages/BacklogPage.tsx` (`/p/:p/backlog`) : sprint en cours (burndown, clôture vers le backlog ou un sprint planifié), sprints à venir (démarrer, retirer), création d'un sprint, backlog ordonné (Monter, Descendre, Ajouter au sprint). Le focus est conservé après un réordonnancement ;
  - section « Backlog » au rail, avant Board (ordre de l'ADR-0003).
- Burndown (`Burndown`, SVG) : la charte n'a pas de palette catégorielle. Une série, « Reste à faire » (`--ath-text-link`, trait de 2 px, points de 8 px), et une ligne de référence en pointillé, « Idéal » (`--ath-text-mute`). Contraste ≥ 3:1 dans les deux thèmes (validateur de la consigne dataviz). La distinction ne repose pas sur la couleur seule : trait, légende, libellés directs. Info-bulle par jour et tableau des données (`details`).
- Tests :
  - `backlog-page.test.tsx` (5, axe compris) ;
  - listes de sections du rail mises à jour ;
  - e2e `backlog.spec.ts` dans un projet à part (`AGL`) : un tracker Tâche dans ARI perturbait `navigation` et `parcours`.
- Vérifications : Vitest web 390 sur 390, `tsc` OK, API agile et OpenAPI OK, e2e 41 sur 41 (backlog rejoué seul après correction de son adresse finale).

## Décisions et pièges
- Planifier est réservé aux administrateurs et aux chefs de projet (`athena-admin`, `athena-pm`) ; le serveur l'impose aussi. Ajouter un ticket à un sprint reste ouvert à `athena-user` côté API, comme avant.
- Retirer d'un sprint se fait sans confirmation (le ticket revient au backlog avec son rang), avec l'annotation exigée par `guards.test`.
- Bash : un `perl -e` avec des backticks dans des guillemets doubles est substitué par le shell. Écrire les textes avec Edit.

## Prompt de reprise
T-0117 (Roadmap : versions, progression, ajout de tickets à une version, publication).
