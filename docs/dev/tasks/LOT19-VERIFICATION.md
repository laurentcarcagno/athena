# Lot 19 : vérification (PPM, incrément I2, roadmap consolidée)

Date : 2026-11-17. Source : `docs/ppm/07-plan-livraison.md` § I2, `docs/ppm/08-backlog.md` B27 à B31, `docs/ppm/04-fonctionnalites.md` F3.

## Recette mesurable de l'incrément I2

| Critère | Résultat | Preuve |
|---|---|---|
| Écart à la baseline identique au Gantt du projet (test de concordance) | Oui : l'écart du couloir vaut la variance du Gantt pour la tâche qui finit le plus tard | `ppm/roadmap.test.ts` |
| Chaque élément mène à son objet | Projet, phase (fiche du projet), versions (Planning > Versions), retards (board), risque (rapport Risques) | `RoadmapView.test.tsx`, e2e |
| Un projet créé depuis le gabarit ECSS a ses 7 phases et ses 13 revues | Oui | `core/normative-templates.test.ts` (gabarit `spatial-project`) |
| Roadmap de 50 projets en moins de 2 s | Oui : P95 69 ms sur 50 projets sans gabarit (chaque projet à gabarit ajoute la lecture de son instantané de gabarit, mesure à refaire avec des gabarits) ; santé 1,7 s | `ppm/portfolio-perf.test.ts` (`ATHENA_PERF=1`) |
| Aucune trace d'un projet masqué | Oui | `ppm/roadmap.test.ts` |

## Tâches

| Tâche | Backlog | Résultat |
|---|---|---|
| T-0211 | B29 | critère de gate filtré sur deux champs (`and`), rétrocompatible |
| T-0212 | B30 | gabarit `spatial-project` (ECSS-M-ST-10) : 7 phases, 13 revues, RID majeur ou mineur |
| T-0213 | B31 | gabarit `armement-1618` : 4 phases, 9 revues typées |
| T-0214 | B27 | `GET /v1/portfolios/:k/roadmap` |
| T-0215 | B27 | page `/portefeuilles/:clé/roadmap` (frise, tableau) |
| T-0216 | B28 | baseline fantôme, écart, vue jalons imprimable, choix de la baseline |

## Écarts

| Écart | État |
|---|---|
| B27 : repli par portefeuille au-delà de 50 couloirs | Infaisable à ce stade : la page affiche un seul portefeuille ; le regroupement multi-portefeuilles appartient à la vue direction (I3) |
| B31 : approbation par l'assurance qualité étatique comme critère de sortie | Reporté avec la décision de gate par l'AQ (déjà possible via `qaDecides` pour les gabarits qui le déclarent) ; le gabarit 1618 ne le déclare pas, car son rattachement aux phases est une hypothèse de l'annexe |
| B31 : héritage par marché | Utilise l'héritage de gabarits existant (aucun développement) |
| Gabarits : l'éditeur de gabarit de l'interface ne propose pas le second filtre `and` | Les gabarits livrés l'utilisent ; l'édition d'un critère déjà posé le conserve ; l'ajout par l'interface n'est pas fait |

## Tests

- API : 777 réussis, 2 ignorés (mesures `ATHENA_PERF`). Web : 644 réussis. e2e : suite complète rejouée, 73 réussis, 3 ignorés (section roadmap dans `sante-portefeuille.spec.ts`).
- Migrations réelles du lot : aucune. Prochaine : 075.
