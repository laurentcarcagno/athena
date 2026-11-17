# Lot 20 : vérification (PPM, incrément I3, revues de portefeuille)

Date : 2026-11-18. Source : `docs/ppm/07-plan-livraison.md` § I3, `docs/ppm/08-backlog.md` B32 à B34, `docs/ppm/04-fonctionnalites.md` F7 et F6.

## Recette mesurable de l'incrément I3

| Critère | Résultat | Preuve |
|---|---|---|
| Un instantané rejoué deux fois pour la même période n'en crée qu'un | Oui (unicité portefeuille, nature, période ; le job renvoie l'existant) | `ppm/snapshot.test.ts`, `ppm/snapshot-job.test.ts` |
| La purge respecte la rétention réglée | Oui : réglage de l'organisation, surcharge par portefeuille (migration 076), revues sans limite par défaut, instantané d'une revue conservé | `ppm/snapshot-job.test.ts`, `ppm/snapshot.test.ts` |
| Le dossier de revue reprend l'instantané figé, pas les données du jour | Oui : la modification d'un projet après la revue ne change pas le dossier | `ppm/snapshot.test.ts` (B33) |
| La matrice ne compte aucun risque d'un tracker masqué | Oui (RLS, champs à lecture restreinte exclus) | `ppm/governance.test.ts` |
| Aucune trace d'un projet masqué dans un instantané | Oui : les lignes sont filtrées à la lecture, totaux recalculés | `ppm/snapshot.test.ts`, `ppm/governance.test.ts` |

## Tâches

| Tâche | Backlog | Résultat |
|---|---|---|
| T-0218 | B32 | instantanés, migration 075 |
| T-0219 | B32 | jobs `instantanes` et `retention`, boucle du worker |
| T-0220 | B32 | comparaison, flèche de tendance, mini-courbes |
| T-0221 | B33 | revue de portefeuille et dossier imprimable |
| T-0222 | B34 | courbe de tendance des jalons (MTA) |
| T-0223 | B34 | passage des gates, matrice des risques, suivi des actions |
| (hors plan) | B32 | rétention propre au portefeuille, migration 076 |

## Écarts

| Écart | État |
|---|---|
| B34 : diagonale de référence de la courbe MTA | Infaisable avec le composant `<Chart>` actuel (pas de marque de référence) ; la courbe et sa vue tableau donnent les mêmes valeurs |
| B32 : interface de la surcharge de rétention par portefeuille | API seulement (`PUT /v1/portfolios/:k/snapshot-retention`) ; pas de formulaire |
| B33 : instantané automatique et revue créés par un seul geste | Fait : la création d'une revue fige l'instantané |
| Dossier : roadmap des jalons et risques détaillés | Le dossier reprend les valeurs figées de l'instantané (santé, phase, prochaine revue, risque maximal) ; la roadmap et la matrice affichent les données du jour, volontairement hors dossier |

## Tests

- API : tests ciblés verts à chaque tâche ; web : 653 réussis. e2e : **suite interrompue à 67 tests sur 73** (tous verts, dont `sante-portefeuille.spec.ts` avec les étapes instantané, revue, dossier et gouvernance) : le processus a été arrêté par le système pour manque de mémoire, avant les derniers specs (thème et suivants). À rejouer en entier à la reprise : `cd e2e && pnpm test`.
- Migrations réelles du lot : 075 (instantanés), 076 (rétention par portefeuille). Prochaine : 077.
