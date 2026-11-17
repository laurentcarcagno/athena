# Lot 24 : vérification (PPM, incrément I7, gouvernance V2)

Date : 2026-11-18. Source : `docs/ppm/07-plan-livraison.md` § I7, `docs/ppm/08-backlog.md` B38, `03` § 2.6 et 2.7, F6.

## Recette

| Critère | Résultat | Preuve |
|---|---|---|
| Une alerte s'ouvre et se résout seule | Oui : calculée à la lecture ; la revue tenue fait disparaître l'alerte de retard | `ppm/decision.test.ts` |
| Une décision « suspendre » propose la transition sans l'appliquer | Oui : l'état du projet reste `in_progress` ; la proposition est affichée | `ppm/decision.test.ts`, `DecisionsPanel.test.tsx` |
| Changement chiffré appliqué en avenant de budget, une seule fois, par la finance | Oui | `ppm/decision.test.ts` |
| Projet de pilotage hors santé et hors roadmap, risques et actions comptés | Oui | `ppm/decision.test.ts` |
| Aucune trace d'un projet masqué | Oui (décisions, alertes) | `ppm/decision.test.ts` |

## Écarts

| Écart | État |
|---|---|
| Exposition aux risques dans le temps (barres empilées par instantané) et trajectoire d'un risque | Non faits : les instantanés ne figent pas le détail des risques ; à ajouter avec un champ `risks` des lignes d'instantané |
| Historique des changements de périmètre, clôture et retour d'expérience | Couverts en partie : une décision « clôturer » et son motif ; pas de formulaire de retour d'expérience |
| Notification de l'échéance d'une décision à son responsable | Non faite (mécanisme de notifications existant, non branché) |
| Interface de marquage d'un projet de pilotage | API seulement |
| Alertes sur seuils réglables | Seuil de surcharge réglable (réglage PPM) ; les autres sont fixes (jour, deux instantanés, budget) |

## Tests

- API : 827 réussis, 2 ignorés ; web : suite complète verte. e2e : suite non rejouée depuis l'interruption du lot 20 (arrêt système pour manque de mémoire).
- Migration du lot : 081. Prochaine : 082.
