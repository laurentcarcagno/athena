# Journal de la tâche T-0097

## Fait
- Migration 031 : `tracker_type` (RLS forcée), `tracker.type_key`.
- `core/tracker-types.ts` : 13 types livrés (données), `typeExists` ; `tracker-type.service.ts` (liste fusionnée livrés + organisation, création, modification d'un livré = version de l'organisation, réinitialisation, refus si utilisé) ; `tracker-type.controller.ts` (`/v1/tracker-types`) ; `PATCH …/trackers/:t/type`.
- `typeKey` dans `TrackerSpec`, `TrackerDefinition`, liste des trackers, templates (`TemplateTrackerSchema`, `trackersOf`), `tracker.yaml` (`type`) et reconstruction.
- Tests : `core/tracker-type.test.ts`, extension de `reverse-rebuild.test.ts`.

## Reste à faire
- Interface d'administration et choix du type : T-0100. Catégorie « Autres » : à afficher côté interface (T-0054).

## Décisions et pièges
- Les types livrés ne sont pas semés en base (comme les templates) : une organisation neuve les voit sans migration. Pas de clé étrangère sur `tracker.type_key` (type livré ou de l'organisation) : l'intégrité est vérifiée par le service.
- Catégories en anglais côté données (`engineering`…), libellés français dans l'interface.

## Commandes utiles
- `cd apps/api && npx vitest run src/core/tracker-type.test.ts`

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0100 (interface des types).
