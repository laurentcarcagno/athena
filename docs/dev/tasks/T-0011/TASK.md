# T-0011 : ATQL et recherche (phase 4)
- Livre : analyseur (AND/OR/NOT, =, !=, ~, <, >, <=, >=, IN, NOT IN, IS [NOT] EMPTY, currentUser(), ORDER BY), compilateur SQL entierement parametre, recherche paginee avec comptage, delai de 5 s, limites de cout (longueur, profondeur, nombre de conditions), route GET /v1/projects/:project/search.
- Constats de test : les parametres non references dans la requete de comptage et le tri textuel des nombres (10 avant 8) ; corriges.
- Tests : 22 (99 au total pour lAPI).
- Non fait : autocompletion, constructeur visuel de filtres, filtres sauvegardes, fonctions openSprints() et linkedTo(), historique via HISTORY, plein texte FTS, index sur champs frequents.
