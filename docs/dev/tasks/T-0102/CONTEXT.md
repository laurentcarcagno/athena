# Journal de la tâche T-0102

## Fait
- Colonnes : `lib/columns.ts`, `ColumnPicker`, `ArtifactTable` généralisé (`TableColumn`, `columnFor`, colonnes des champs `f:<clé>`), paramètre d'adresse `cols`, colonnes stockées dans `saved_filter.columns` et restituées par la vue (`viewOf`, `viewToParams`).
- Épingler une vue : `PinToggle` dans `SavedViews`.
- Fil d'Ariane : `SiblingMenu` (projets, trackers, vues du tracker selon son type), chargement à l'ouverture, Échap, focus rendu.
- `lib/tracker-views.ts` : `viewsFor` partagé.
- Tests : 13 tests web de plus (201 au total).

## E2E rejoués (13 sur 13)
- Rejeu après arrêt des processus ORBITIA qui occupaient les ports 3000 et 3001 (accord de l'utilisateur).
- **Bug réel trouvé par les e2e, invisible en jsdom** : l'en-tête de page collant (`z-index: 50`, marge négative de 24 px) interceptait les clics sur le fil d'Ariane. Corrigé (`.ath-breadcrumb { position: relative; z-index: 60 }`).
- Tests périmés corrigés : clic sur la clé via le lien du tableau (le rail propose aussi la clé dans les récents), onglet Acteurs devenu page Membres, clé `ARI-LAY-0001`, case à cocher pilotée par l'adresse (`click` puis `toBeChecked`).
- Lancer les e2e par `pnpm --filter @athena/e2e test` (remise à zéro de la base) et non `npx playwright test` seul.

## Reste à faire
Rien.

## Prompt de reprise
Lire `docs/dev/STATE.md`.
