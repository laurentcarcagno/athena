# Journal de la tâche T-0101

## Fait
- API : `ProjectOverviewService.activity` (révisions et commentaires réunis, tri `(date, id)` décroissant, curseur `date|id`, filtres tracker / auteur / type, champs à lecture restreinte retirés du résumé, liste des auteurs) et `GET /v1/projects/:p/activity`. Aucune migration.
- Web : `ActivityTab` (tableau date / personne / événement / item, filtres synchronisés avec l'adresse `?t=&a=&k=`, « Plus ancien » par curseur), route `activite`, onglet ajouté à `IMPLEMENTED_TABS`.
- Tests : `project-overview.test.ts` (ordre, filtres, pagination sans trou ni doublon, champs restreints, curseur invalide, isolation), `web9.test.tsx` (4 tests dont axe).

## Reste à faire
- Les artefacts non lisibles (listes d'ayants droit, Lot 4) devront être exclus du flux.
- Le résumé n'indique pas les valeurs modifiées (seulement les champs) : volontaire, l'historique de la fiche donne les diffs.

## Prompt de reprise
Fin du Lot 1 : compte rendu à l'utilisateur ; Lot 2 seulement s'il l'ouvre.
