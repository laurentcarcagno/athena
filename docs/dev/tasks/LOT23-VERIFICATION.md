# Lot 23 : vérification (PPM, incrément I6, finances)

Date : 2026-11-18. Source : `docs/ppm/07-plan-livraison.md` § I6, `docs/ppm/08-backlog.md` B37, `03` § 2.10, F5.

## Recette

| Critère | Résultat | Preuve |
|---|---|---|
| Import de 1 000 lignes dont 3 erronées : 997 enregistrées, 3 rapportées | Oui, avec numéro de ligne et motif ; réimport du même fichier sans effet (empreinte) | `ppm/finance.test.ts`, `FinancePage.test.tsx` |
| Aucun taux lisible hors finance et administration | Oui : PMO et direction refusés sur les taux et le coût du temps | `ppm/finance.test.ts` |
| Budget en ajout seul | Oui (aucun droit de modification ni de suppression sur `budget_line`) | `ppm/finance.test.ts` |
| Budget courant, EAC, alertes | Oui : initial + avenants + arbitrages ; EAC = réel + prévisions des mois à venir ; `exceeded` et `overrun` | `ppm/finance.test.ts` |
| Projet masqué : aucune trace financière | Oui (politique `acl_read` sur les tables de projet) | `ppm/finance.test.ts`, test d'architecture RLS |

## Écarts

| Écart | État |
|---|---|
| Vues : graphique à puces, cascade, treemap par catégorie, carte de chaleur des écarts, tableau des écarts à mini-courbes | Non faits : barres par catégorie, courbe en S et tableau des écarts sont livrés ; les autres vues demandent des types de graphique que `<Chart>` n'a pas encore |
| Interface des taux des ressources et du coût du temps | API seulement (`/v1/finance/rates`, `/v1/finance/projects/:p/time-cost`) |
| Consolidation financière d'un portefeuille et alertes dans un centre d'alertes | Reportées avec le centre d'alertes (I7) |
| Import par webhook entrant | Point d'extension seulement : le même format CSV peut être posté à `/v1/finance/actuals/import` |
| Devise | Une seule devise (euro) ; la devise par portefeuille est prévue en V2 (§ 2.2) |

## Tests

- API : 821 réussis avant correction de `key-guard` (corrigé : les clés de tickets passent par `resolve_artifact`) ; web : suite complète verte. e2e : suite non rejouée depuis l'interruption du lot 20 (arrêt système pour manque de mémoire).
- Migration du lot : 080. Prochaine : 081.
