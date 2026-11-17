# Lot 17 : vérification (PPM, incrément I0)

Date : 2026-11-17. Source : `docs/ppm/07-plan-livraison.md` § I0, `docs/ppm/08-backlog.md` B04 à B16.

## Recette mesurable de l'incrément I0

| Critère | Résultat | Preuve |
|---|---|---|
| Un projet existant reste valide après migration (état `in_progress`) | Oui | migration 068, colonne `lifecycle_state` par défaut `in_progress` ; `ppm/lifecycle.test.ts` |
| Une transition non permise est refusée | Oui (409 ; 403 sans droit ; 422 sans motif d'annulation) | `ppm/lifecycle.test.ts` |
| Toute date de revue modifiée apparaît dans l'historique avec son auteur | Oui (`planned_end`, `review_planned_on`) | migration 069, `core/normative-templates.test.ts` « phases datées » |
| Un graphique ECharts s'affiche sous la CSP de production | Oui | T-0188 (`docs/dev/tasks/T-0188/CONTEXT.md`) |
| Le chunk ECharts pèse moins de 200 Ko compressés | **Non : 220 Ko gzip, 179 Ko brotli** | Écart accepté par l'utilisateur (T-0188) |

## Tâches

| Tâche | Backlog | Résultat |
|---|---|---|
| T-0185 | B04 | `PpmModule` |
| T-0186 | B05 | interrupteurs de fonctionnalité (065) |
| T-0187 | B06 | réglages PPM (066) |
| T-0188, T-0189 | B07 à B09 | ECharts, composant `<Chart>` |
| T-0190 | B10 | méta du projet (067) |
| T-0191, T-0192 | B11 | cycle de vie, API puis interface (068) |
| T-0193, T-0194 | B12 | phases datées, décisions de gate, frise (069) |
| T-0195 | B13 | rôles probabilité et impact (070) |
| T-0196 | B14 | test d'architecture RLS (3 tests, 2 exceptions justifiées) |
| T-0197 | B15 | unité de `remaining` : `docs/ppm/verifications/B15-remaining.md` |
| T-0198 | B16 | P95 1,6 s sur 50 projets : `docs/ppm/verifications/B16-sante-palier1.md` |

## Écarts

| Écart | État |
|---|---|
| Chunk ECharts au-dessus de 200 Ko | Accepté par l'utilisateur (T-0188) |
| B12 : lignes de phase créées depuis le gabarit | Reporté à la demande de l'utilisateur, repris dans le plan de levée des écarts (voir `STATE.md`) |
| B12 : décision de gate par l'assurance qualité | Idem |
| B13 : rôles dans les gabarits livrés, widget `risks` du tableau de bord | Idem |
| B15 : confirmation de l'unité par les chefs de projet | Non faisable dans le dépôt (aucune donnée réelle) ; hypothèse « jour » documentée, à confirmer à la migration en minutes (I4) |

## Tests

- API : tests ciblés verts à chaque tâche ; dernière suite complète 742/742 (T-0195), puis 3 tests d'architecture RLS ; mesure B16 sous `ATHENA_PERF=1`.
- Web : 631/631.
- e2e : suite complète rejouée : 72 réussis, 3 ignorés (spec `gabarits` adapté à la frise : « Exigences » apparaît dans la phase en cours et dans la frise).
- Migrations réelles du lot : 065 à 070. Prochaine : 071.
