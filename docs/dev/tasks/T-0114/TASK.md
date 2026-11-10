# T-0114 : Board (Lot 9, D)

Objet : carte enrichie (type, priorité, échéance, responsable lisible, bloqué), clic = panneau, filtre rapide dans l'URL, création par colonne, index `/p/:p/board`.

## Décisions
- API (`BoardService.view`) : `trackerName`, `assigneeName` (`user_account.display_name`), `priority` et `priorityLabel` (rôle `priority`), `due` (rôle `due_date`), `blocked` (lien entrant `blocks` depuis un ticket non terminé). Les droits de lecture par champ s'appliquent à chaque valeur. Le board porte aussi `trackers`, et chaque colonne `creatable` (elle contient un statut « à faire » du premier tracker).
- Adresse : `?i=` (panneau), `?q=` (clé ou titre), `?moi=1`, `?bloques=1`, `?couloir=assignee|tracker`. Un filtre remplace l'entrée d'historique, tandis qu'ouvrir une carte en ajoute une.
- « Bloqué » utilise la pastille d'avertissement : le rouge reste réservé aux cérémonies.
- Section « Board » ajoutée au rail, juste après la Vue d'ensemble (ordre de l'ADR-0003). `/board/:board` y est rattaché, et non plus à Planification.
- L'index liste les boards du projet, puis le board de chaque tracker.

## Critères d'acceptation
- [x] Board › ticket › retour en 1 action, filtres conservés (panneau, Échap ou Fermer).
- [x] « Déplacer vers » au clavier conservé.
- [x] Carte enrichie ; création depuis une colonne au statut initial ; index des boards.
