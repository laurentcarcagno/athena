# Journal de la tâche T-0156

## Fait
- API : `GET /v1/search/facets?q=&field=&project=` : répartition des tickets d'une recherche par statut, catégorie, tracker, projet ou un champ (`priority`, `severity`…). Même préparation que la recherche (requête compilée, champs à lecture restreinte interdits, même transaction donc mêmes règles d'accès), coût borné (5 s, 10 000 tickets) ; les 7 valeurs les plus fréquentes, le reste dans « autres » (`groupBuckets`).
- Tableau de bord : genre `chart` (recherche, `field`, `form` = `donut` | `bars` | `count`), validé par l'API (forme obligatoire, champ sauf pour l'indicateur, requête ATQL valide).
- Carte (`ChartCard.tsx`) : **anneau** (total au centre, légende chiffrée, « Autres » en gris) ; **barres** par valeur ; **indicateur** chiffré. Palette de données du thème, SVG sans style en ligne ; chaque valeur de la légende ouvre la recherche filtrée sur cette valeur ; pied « Ouvrir la recherche ».
- Organiser : « + Ajouter une carte » propose « Graphique sur une recherche… » (titre, recherche ATQL facultative, forme, champ) ; la carte prend la portée de la page (projet).
- Tests : API ATQL 26/26 (répartition, filtre, « Autres », isolation des organisations, champ invalide), tableau de bord 6/6 (validation des cartes graphiques) ; web 477/477 ; e2e `ergonomie` (anneau par statut ajouté, retrouvé au rechargement, retiré).

## Décisions et pièges
- Pas de camembert plein ni de 3D : l'anneau porte le total au centre et se lit mieux ; le Responsable n'est pas proposé comme champ de répartition (les valeurs sont des identifiants de compte).
- Un champ à lecture restreinte pour le lecteur est refusé en répartition (comme en filtre) ; le jeu de test ATQL n'en contient pas, la règle est la même que pour la recherche (`prepare`).
