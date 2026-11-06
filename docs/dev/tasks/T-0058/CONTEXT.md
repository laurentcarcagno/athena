# Journal de la tâche T-0058

## Fait
- API : board virtuel d'un tracker, clé `~TRACKER` (`BoardService.load`) : une colonne par statut, sans WIP ; `view` et `moveCard` fonctionnent sans changement (les routes existantes suffisent). Non listé par `GET …/boards`.
- Web : `BoardView` extrait de `BoardPage` (`header` facultatif) ; `TrackerScreen` : vues Tableau et Board, `viewsFor(type)` (Tableau toujours ; Board si le type le propose ; tracker sans type : toutes les vues), redirection vers le Tableau pour une vue que le type n'offre pas ; filtres et mini-workflow réservés au Tableau.
- Tests : `agile.test.ts` (board virtuel), `web10.test.tsx` (6 tests de plus).

## Reste à faire
- Les vues Arbre et Matrice s'ajoutent à `TRACKER_VIEWS` au Lot 2 ; Document et Timeline/Calendrier sont hors du périmètre actuel.

## Décisions et pièges
- Décision du 2026-11-06 : la vue Board d'un tracker est un board de projet filtré sur ce tracker ; réalisé sous forme de board virtuel plutôt que d'un board stocké par tracker (suit la configuration du tracker, aucune migration).
- La limite WIP d'un board stocké reste propre aux boards de projet.

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0059 (panneau de détail scindé).
