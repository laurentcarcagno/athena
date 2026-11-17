# B15 : unité de `remaining` dans les données existantes

Date : 2026-11-17. Requête : `tools/remaining-inventory.sql` (lecture seule, à lancer sur chaque base : `docker exec -i athena-dev-postgres-1 psql -U athena -d <base> < tools/remaining-inventory.sql`).

## Constats

| Base | Projet | Tracker | Tickets | Valorisés | Min | Max | Moyenne | Non entiers |
|---|---|---|---|---|---|---|---|---|
| `athena_dev` | LUMEN | TSK | 30 | 26 | 0 | 12 | 3,7 | 0 |
| `athena_e2e` | VPL | TSK | 6 | 2 | 1 | 1 | 1,0 | 0 |
| `athena` | (schéma non migré, sans données) | | | | | | | |

- Un seul projet de démonstration porte des valeurs significatives (LUMEN) ; toutes sont entières, de 0 à 12. Cela ne dit pas l'unité : 12 est plausible en jours comme en points.
- Les gabarits livrés (`core/templates/common.ts`, `planningFields`) nomment le champ « Reste à faire (jours) » : pour tout projet créé depuis Spatial ou Défense, l'unité **déclarée** est le jour. LUMEN vient de la démonstration (`tools/dev-start.mjs`) et suit le même libellé.
- Aucune donnée de production n'existe dans le dépôt : la confirmation « par chaque chef de projet » (D5) ne peut se faire qu'à la migration réelle, sur la base de l'organisation.

## Décision et conséquence pour la suite

- Hypothèse retenue pour la migration en minutes : l'unité existante est le **jour** (libellé du champ), converti à la journée de travail de l'organisation (réglage `PPM`, T-0187), soit `valeur × durée de la journée`.
- Un projet dont le champ a été renommé ou dont le chef de projet répond « points » n'est pas migré (rapport par projet, comme le demande le backlog).
- La migration elle-même appartient à l'incrément qui introduit la charge en minutes (I4, B35) ; cette vérification n'a rien à convertir dans le lot 17.
