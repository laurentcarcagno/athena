# T-0015 : boards et sprints (phase 5)
- Livre : boards multi-trackers (colonnes liees aux statuts, limite WIP), vue par colonne, deplacement de carte via la transition de workflow (conditions et validateurs appliques, pas de contournement), sprints (planifie, actif, clos, un seul actif par projet, un artefact dans un seul sprint ouvert), cloture avec retour au backlog, burndown reconstitue depuis les revisions, routes REST.
- Constat de test : les colonnes date etaient lues en heure locale puis converties en UTC (jours decales) ; lues desormais en texte.
- Tests : 8 (132 au total pour lAPI).
- Non fait : classement manuel (rank) du backlog, swimlanes, velocite et diagramme de flux cumule, roadmap/timeline, tableaux de bord et widgets, interface graphique.
