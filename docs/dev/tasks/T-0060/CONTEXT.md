# Journal de la tâche T-0060

## Fait
- Migration 033 `user_pin` (RLS forcée) ; `PinService` (liste, visite avec élagage à 30, favoris, réordonnancement) et `PinController` (`/v1/me/pins`) ; test `pin.test.ts` (isolation par utilisateur et par organisation).
- UI : `Sidebar` accepte des rubriques (`sections`, `NavItem.depth/mono/extra`) ; `Rail.tsx` (`useRailSections`, `useRecordVisits`) : Favoris, Récents, entrées globales, projet courant (onglets des modules actifs, Recherche, Administration), trackers, vues partagées sous le tracker ouvert ; `lib/pins.tsx` (contexte, `pinHref`, `entriesOf`) ; `PinToggle` sur le projet et le tracker ; repli du rail mémorisé (`localStorage`) ; `?v=<id>` applique une vue enregistrée dans l'écran Tracker.
- Tests : `web11.test.tsx` (12 tests dont axe).

## Reste à faire
- Épingler une vue depuis `SavedViews` (le favori de vue existe côté API et rail, mais aucun bouton ne le crée encore) : à ajouter avec T-0061 ou une finition.
- Rail mobile en tiroir (F-09) : hors du lot.

## Décisions et pièges
- Les libellés de favoris et récents sont enregistrés à l'écriture (pas de jointure) : un renommage n'est répercuté qu'à la prochaine visite.
- Les items n'entrent dans les récents qu'avec leur clé canonique (une ancienne clé redirige d'abord).
- `queryByRole('complementary')` : la barre latérale en est un ; toujours nommer le panneau.

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0061 (fil d'Ariane, redirections finales, verrouillage F-01/F-02/F-07, critère « 3 actions »).
