# Journal de la tâche T-0148

## Fait
- Informations clés : un champ est trouvé par son rôle sémantique, sinon par la clé du même nom (`priority`, `version`, `due_date`, `assignee`) : la priorité « haute » d'une exigence s'affiche (elle valait « — »).
- Valeur absente : « Non assigné » et « M'assigner » (si le champ est modifiable par l'utilisateur) ; « + Ajouter » ailleurs : il ouvre Détails et place le focus sur le champ, ou l'onglet Liens (parent, bloqué par), ou le Backlog (sprint). Sans champ dans le tracker, « — » reste.
- En-tête : « ✓ Enregistrement automatique », puis « Enregistré à HH:MM » après un enregistrement ou une transition ; le lien répété vers le projet est retiré (le projet est déjà au-dessus du titre) ; marquage export en badge « Contrôle export : ITAR ».
- Détails : l'éditeur de marquage n'est montré qu'aux administrateurs et chefs de projet.
- Conflit (409) : la fiche est rechargée, la saisie reste dans le champ, avec « Enregistrer ma version » et « Garder la version actuelle ».
- Tests : web 461/461 (dont le repli par clé et le conflit) ; e2e `fiche`, `liens`, `approbation`, `parcours`, `ergonomie` verts.
