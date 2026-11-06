# Journal de la tâche T-0102

## Fait
- Colonnes : `lib/columns.ts`, `ColumnPicker`, `ArtifactTable` généralisé (`TableColumn`, `columnFor`, colonnes des champs `f:<clé>`), paramètre d'adresse `cols`, colonnes stockées dans `saved_filter.columns` et restituées par la vue (`viewOf`, `viewToParams`).
- Épingler une vue : `PinToggle` dans `SavedViews`.
- Fil d'Ariane : `SiblingMenu` (projets, trackers, vues du tracker selon son type), chargement à l'ouverture, Échap, focus rendu.
- `lib/tracker-views.ts` : `viewsFor` partagé.
- Tests : 13 tests web de plus (201 au total).

## Reste à faire
- Rejeu des e2e (voir le compte rendu : ports 3000 et 3001 occupés).

## Prompt de reprise
Lire `docs/dev/STATE.md`.
