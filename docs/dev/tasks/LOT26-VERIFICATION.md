# Lot 26 : vérification (PPM, incrément I9, charge et dimensionnement)

Source : `docs/ppm/07-plan-livraison.md` § I9, B42. Rapport : `docs/ppm/verifications/B42-dimensionnement.md`.

## Recette

| Critère | Résultat |
|---|---|
| Rapport de dimensionnement avec les mesures et la configuration recommandée | Fait (`B42-dimensionnement.md`) |
| Décision de matérialiser `project_kpi` | Oui : le tableau de santé passe de 8 à 11 s à 0,12 s au palier 2 ; migration 083, job `indicateurs`, lecture avec repli |
| Visibilité des lignes matérialisées | Politique `acl_read` ; test `ppm/kpi-cache.test.ts` ; test d'architecture RLS vert |

## Écarts

| Écart | État |
|---|---|
| Mesure sous charge concurrente | Faite : 50 lectures simultanées, P95 5,3 s (lectures sérialisées, 9 par seconde) ; amélioration à traiter en recette |
| Mesure sur disque SSD | Infaisable depuis le poste de développement (disque USB) ; à mesurer sur le serveur de recette |
| Job différé `capacite` | Inutile jusqu'à environ 1 500 personnes (1,5 à 2 s) ; seuil documenté |
| Import de 100 000 lignes | Fait : 4,3 s après insertion par paquets |

## Tests

- API : `kpi-cache` 2 tests, mesure `portfolio-scale` (sous `ATHENA_SCALE=1`). e2e : non rejouée depuis l'interruption du lot 20.
- Migration du lot : 083. Prochaine : 084.
