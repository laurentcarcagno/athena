# T-0117 : Roadmap (Lot 9, F)

Critère : avancement d'une version en 1 clic depuis le rail.

## Fait (2026-11-10)
- API (`report.service.ts`, `agile.controller.ts`) :
  - `GET /v1/projects/:p/releases/:id/items` : tickets de la version (par tracker puis numéro), titre seulement s'il n'est pas à lecture restreinte, statut, points ;
  - `DELETE …/releases/:id/items/:clé` : retrait réservé aux responsables, refusé après publication ;
  - ajout, retrait et publication vérifient que la version appartient au projet de la route (avant : seul l'identifiant comptait) ; un identifiant qui n'est pas un UUID donne `not_found` ;
  - `report.test.ts` complété.
- Web :
  - `pages/RoadmapPage.tsx` (`/p/:p/roadmap`) : calendrier (Gantt), une carte par version (état, avancement en %, tickets terminés, points, barre), tickets liés vers la fiche (origine `fromHere`), ajout par clé, retrait, publication avec confirmation, création d'une version ;
  - `components/ReleaseCharts.tsx` : `Bar`, `Gantt`, `ganttLayout` sortis de `DashboardPage` (réexporté pour `web2.test`) ;
  - section « Roadmap » au rail, après Trackers (ADR-0003), fil d'Ariane.
- Tests : `roadmap-page.test.tsx` (5, axe compris), listes du rail mises à jour, e2e `roadmap.spec.ts` (projet `AGL`, clic sur le rail depuis le Board).

## Décisions et pièges
- Graphiques repris tels quels (couleurs `ath-bar`, `ath-gantt` existantes) : aucune nouvelle couleur.
- Publier passe par la confirmation (irréversible) ; retirer non (réversible), avec l'annotation exigée par `guards.test`.
- Ajouter reste ouvert à `athena-team-member` côté API (comme avant) ; l'interface le réserve aux responsables, comme le Backlog.
- Pas de page de notes de version : hors critère.

## Prompt de reprise
T-0118 (API `GET /v1/search`).
