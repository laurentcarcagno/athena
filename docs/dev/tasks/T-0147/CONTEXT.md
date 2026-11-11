# Journal de la tâche T-0147

## Fait
- Écran Tracker : onglets de vue (Tableau, Board, Arbre, Matrice) juste sous le workflow, puis une seule barre de filtres.
- Barre : recherche extensible (« Rechercher dans Exigences (titre, clé, texte)… », Entrée lance, plus de bouton coche) ; listes à libellé intégré (« Sévérité : tous », « Sévérité : majeure ») ; puces « Assigné à moi » et « Liens suspects » (`aria-pressed`) ; à droite, vue enregistrée (« Vue : par défaut »), Colonnes et « Requête avancée » (« Filtres simples » pour revenir). En mode requête, le champ ATQL prend la place de la recherche.
- Téléphone : recherche et bouton « Filtres » (« Filtres (2) » avec des filtres actifs) qui déplie listes, puces et réglages en panneau ; le workflow défile sur une ligne.
- Défaut corrigé en passant (trouvé par `controles.spec.ts`) : les puces n'avaient pas l'anneau de focus de 2 px des contrôles.
- Tests : web 460/460 (dont la barre unique) ; e2e `ergonomie` (téléphone), `controles`, `parcours` verts.
