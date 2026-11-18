# B42 : charge et dimensionnement du serveur (palier 2)

Date : 2026-11-18. Mesure : `apps/api/src/ppm/portfolio-scale.test.ts` (`ATHENA_SCALE=1 pnpm vitest run src/ppm/portfolio-scale.test.ts --disable-console-intercept` dans `apps/api`). Jeu de données : **300 projets, 499 800 tickets (1 666 par projet, un tiers terminés), 1 000 personnes en 40 équipes, 1 000 allocations, budgets et réels par projet**, créé en 30 s (projets par les services, tickets par SQL). Machine de mesure : poste de développement Windows 11, PostgreSQL 16 en conteneur Docker, base sur disque USB (donc plus lent qu'un serveur à disque SSD local) ; une seule session cliente, sans charge concurrente.

## Mesures (P50 et P95)

| Vue ou job | Sans matérialisation | Avec `project_kpi` |
|---|---|---|
| Tableau de santé du portefeuille (300 projets) | 8,4 s (un appel ; mesures précédentes : P50 8,6 s, P95 10,6 s) | **P50 112 ms, P95 121 ms** |
| Instantané de portefeuille (300 projets) | P50 3,9 s, P95 4,4 s | **P50 345 ms, P95 354 ms** |
| Job de matérialisation des indicateurs (tous les projets) | — | 18 s (toutes les 10 minutes) |
| Roadmap consolidée (300 projets) | P50 228 ms, P95 258 ms | idem |
| Tableau de passage des gates | P50 602 ms, P95 777 ms | idem |
| Capacité de 1 000 personnes sur 12 mois | P50 1,5 s, P95 1,5 à 2,0 s | idem |
| Finances d'un projet | P50 6 ms, P95 10 ms | idem |

## Décision : matérialiser `project_kpi`

- **Oui.** Au palier 2, le tableau de santé calculé à la lecture met 8 à 11 s (cible : moins de 2 s). Les indicateurs d'un projet (ouverts, en retard, bloqués, avancement, vélocité, charge) sont écrits par un job du worker toutes les dix minutes, en contexte système, une ligne par projet (`project_kpi`, migration 083).
- La lecture ne rend une ligne que si elle a moins de 15 minutes et seulement si le lecteur voit le projet (politique `acl_read`) ; sinon elle recalcule en direct. Les totaux de portefeuille restent calculés à la lecture sur les lignes visibles (§ 3.3).
- Le calcul direct reste le repli et le mode du palier 1 (50 projets : P95 1,6 s, `B16-sante-palier1.md`).

## Concurrence et import (mesurés le 2026-11-18)

| Mesure | Résultat |
|---|---|
| 50 lectures simultanées du tableau de santé matérialisé (300 projets) | P50 5,3 s, P95 5,3 s, durée totale 5,3 s : les lectures se sérialisent (environ 106 ms chacune, soit 9 lectures par seconde et par instance) |
| Import de 100 000 lignes de réels (insertion par paquets de 5 000) | 4,3 s, 100 000 enregistrées |

La mesure de concurrence est le point faible : à 50 lecteurs simultanés, la dernière attend 5 s. Pistes, par ordre de gain : mettre en cache la réponse du tableau de santé par lecteur pendant quelques secondes, ou lire les lignes matérialisées en une seule requête au lieu d'une par projet (le portefeuille en enchaîne 300), ou répartir sur deux instances d'API. Non traitée dans ce lot ; consignée comme travail de recette.

## Limites constatées

- **Capacité** : 1,5 à 2,0 s pour 1 000 personnes sur 12 mois. Au seuil de 2 s : au-delà de 1 500 personnes, ou à la semaine sur 12 mois, le job différé `capacite` (horaire, une ligne par personne et période) devient nécessaire. Le calcul reste linéaire en personnes × périodes.
- **Gates** : 0,6 à 0,8 s, linéaire en nombre de projets à gabarit (une lecture d'instantané de gabarit par projet).
- Le jeu mesure des tickets simples (un champ de titre, une échéance) : les trackers à nombreux champs ralentissent les recherches ATQL de la matérialisation, pas les lectures matérialisées.
- Aucune mesure de concurrence : elle reste à faire en recette (50 lecteurs simultanés) ; les lectures matérialisées sont des lectures d'index.

## Configuration recommandée (palier 2, estimation à vérifier en recette)

| Composant | Recommandation |
|---|---|
| PostgreSQL | 4 vCPU, 16 Go de mémoire, `shared_buffers` 4 Go, `effective_cache_size` 12 Go, disque SSD local (base estimée à 3 Go avec ce jeu et ses index), sauvegarde quotidienne |
| API | 2 instances de 2 vCPU et 2 Go (état de session en Redis) |
| Worker | 1 instance de 1 vCPU et 1 Go ; il porte le job `indicateurs` (18 s toutes les 10 minutes), le job `instantanes` et les rappels |
| Redis | 1 Go |
| Réseau | latence base-API inférieure à 2 ms (la lecture d'un portefeuille enchaîne des requêtes courtes) |

## Reste à faire en recette

Mesure sous charge concurrente, mesure sur disque SSD, jeu de données avec des trackers réalistes (20 champs), imports de 100 000 lignes de réels, purge des instantanés après un an.
