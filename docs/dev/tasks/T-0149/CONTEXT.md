# Journal de la tâche T-0149

## Fait
- Recherche simple par défaut : « Rechercher un ticket : un mot, une clé (SAT1-BUG-0002), un nom… ». Les mots remplacent la seule clause `text ~ "…"` de la requête (puces et autres clauses intactes) ; une clé de ticket (casse indifférente) ouvre directement la fiche.
- « Requête avancée (ATQL) » affiche le champ ATQL complet, comme avant ; « Recherche simple » y revient. La requête ATQL dans l'adresse reste la seule source de vérité.
- Titre de page : « Recherche ».
- Tests : web 462/462 (traduction des mots, ouverture par clé) ; e2e `recherche`, `navigation`, `ergonomie` verts.
