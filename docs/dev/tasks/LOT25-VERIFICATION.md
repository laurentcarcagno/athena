# Lot 25 : vérification (PPM, incrément I8, demandes, scoring, scénarios, valeur acquise)

Date : 2026-11-18. Source : `docs/ppm/07-plan-livraison.md` § I8, `docs/ppm/08-backlog.md` B41, `03` § 2.11, F1 et F2.

## Recette

| Critère | Résultat | Preuve |
|---|---|---|
| Une demande convertie crée un projet du gabarit choisi, lié à la demande | Oui (7 phases pour le gabarit ECSS-M-ST-10) | `ppm/prioritization.test.ts` |
| Un refus exige un motif et apparaît dans l'historique | Oui (motif obligatoire, une seule décision, audit) | `ppm/prioritization.test.ts` |
| Score = Σ poids × valeur normalisée ÷ Σ poids renseignés ; complétude ; « incomplète » sous 70 % | Oui, critères « plus bas, mieux » inversés ; critère non noté exclu | `ppm/scoring.test.ts` |
| Changer les poids crée une nouvelle version ; les anciennes notes restent lisibles | Oui | `ppm/scoring.test.ts` |
| Un scénario n'écrit rien dans le plan officiel | Oui : test d'architecture (aucun import d'écriture, écriture limitée à `scenario` et `scenario_change`) et comparaison avant et après des allocations, du budget et des dépendances | `ppm/prioritization.test.ts` |
| Valeur acquise : CPI et SPI | Oui (BAC, PV, EV, AC par projet d'exécution) | `ppm/prioritization.test.ts` |

## Écarts

| Écart | État |
|---|---|
| Seize vues de B41 | **Levé en grande partie** : le composant `<Chart>` accepte `scatter`, `radar`, `treemap` et `sankey` (tests d'options) ; livrés dans l'interface : classement avec contribution par critère, bulles valeur × risque et radar par critère (si le modèle porte les critères `valeur` et `risque`), scénarios, quadrant CPI et SPI. Branchés ensuite : treemap de répartition du budget par catégorie (page Finances), comparateur de deux à cinq demandes. Branchés ensuite : sensibilité des pondérations (rang de chaque demande si le poids d'un critère est divisé par deux ou doublé, test unitaire), entonnoir des demandes (toutes, notées, converties). Histogramme des délais de décision branché (création → conversion ou refus, tranches 0–7, 8–30, 31–90, > 90 jours). Sankey objectifs → projets branché (migration 085 : objectifs stratégiques et rattachement pondéré des projets, saisie dans le panneau de priorisation, test d'intégration ; liste des projets sans objectif). Les « initiatives » de l'étude sont les projets du portefeuille |
| Courbe des entrées et sorties, Kanban du pipeline | Le Board existant porte le Kanban d'un tracker ; la courbe n'est pas faite |
| Éditeur de modèle de scoring dans l'interface | API seulement (`POST /portfolios/:k/scoring-model`) |
| Scénarios : édition de plusieurs types de changement dans l'interface | L'interface crée un scénario de glissement ; allocation et budget par l'API |
| Conversion d'une demande depuis l'interface | API seulement (`POST /requests/:t/convert`) ; le refus est dans l'interface |
| Quadrant CPI/SPI en graphique | **Levé** : le composant `<Chart>` accepte le type `scatter` (nuage de points libellés, repères à 1, vue tableau) |

## Tests

- API : 838 réussis (un test GitLab de l'historique a échoué une fois dans la suite complète et passe seul : environnement) ; web : 673 réussis. e2e : suite non rejouée depuis l'interruption du lot 20 (arrêt système pour manque de mémoire).
- Migration du lot : 082. Prochaine : 083.
