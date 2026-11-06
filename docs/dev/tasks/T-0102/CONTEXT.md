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

## Tiroir mobile du rail (constat F-09)
- Sous 768 px le rail devient un tiroir modal : fermé, il n'occupe aucune place ; ouvert, il est fixé à gauche (86 % de la largeur, 320 px au plus) au-dessus d'un fond ; le focus y entre, Tab y reste, Échap / fond / navigation le ferment et rendent le focus au bouton Menu ; la page derrière est inerte (`inert`). Sans `transform`, sans ombre (charte). Le bouton de repli de bureau est masqué.
- Tests : `web11.test.tsx` (5 tests), `components.test.tsx` (CSS), e2e à 375 px (rail masqué, tiroir 0 px à gauche, pas de débordement horizontal).
- Course corrigée au passage : le gestionnaire clavier J / K / Échap de l'écran Tracker est enregistré une fois et lit l'état du dernier rendu (un Échap tapé juste après un rendu était perdu) ; c'était l'échec e2e intermittent vu plus tôt.

## Reste à faire
Rien.

## Prompt de reprise
Lire `docs/dev/STATE.md`.
