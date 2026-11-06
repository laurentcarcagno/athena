# Journal de la tâche T-0057

## Fait
- Migration 032 : `saved_filter` reçoit `tracker_key`, `view`, `columns`, `is_default` (une vue par défaut par tracker, partagée et rattachée à un tracker), droit `update`.
- API : `SavedFilterService.create/list/setDefault`, `GET …/filters?tracker=`, `PATCH …/filters/:id`. Sans tracker, comportement inchangé (filtres de projet).
- Web : `lib/filter-query.ts` (puces ⇄ ATQL, aller-retour testé, requêtes non représentables → `null`), `FilterBar` (assigné à moi, listes déroulantes des champs `select`, texte, bascule requête, erreur 422 affichée), `SavedViews` (liste, appliquer, enregistrer, supprimer avec confirmation, vue par défaut), `TrackerScreen` : fragment ATQL dans `?f=`, tri dans `?sort=`, vue par défaut appliquée à la première visite sans filtre ni tri.
- Tests : `saved-filter.test.ts`, `filter-query.test.ts`, `web10.test.tsx` (18 tests dont axe).

## Reste à faire
- `columns` est stocké et renvoyé mais pas encore exploité par le Tableau (choix des colonnes) : à traiter avec les vues Arbre/Matrice (Lot 2) ou une tâche de finition.
- Filtre « version » de la spécification : couvert par les listes déroulantes des champs `select` (une « version » en texte libre passe par la recherche texte ou la requête).

## Décisions et pièges
- Le fragment ATQL est la seule source de vérité de la barre de filtres ; l'ancien paramètre `s` (état) est remplacé par `f`.
- Le fragment est encadré de parenthèses dans la requête envoyée : `tracker = BUG AND (…)`.

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0058 (vue Board dans le tracker).
