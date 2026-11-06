# Journal de la tâche T-0074

## Fait
- Gabarit **Défense** 1.0 (`templates/defense.ts`) : AQAP-2110 et AQAP-2210 éd. B v1 (août 2022), 12 trackers (NORM, STB, SWR, ICD, SDD, TC, PV, ACI, TF, CR, DRC, RRV), criticité à 5 niveaux paramétrables par programme (A à E, défaut inspiré des DAL), revues non obligatoires donc paramétrables, livrables plan qualité (AQAP-2105), plan de développement logiciel, plan de gestion de configuration, dossiers de conception et de test.
- Champs de marquage `mention` et `export_control` sur chaque tracker (sans effet avant le Lot 4) ; `marking.fields` les déclare.
- Règles : exigences client tracées et vérifiées, tout fait technique rattaché à un article de configuration (lien `concerns` vers ACI).
- Test d'héritage : dérivé « Défense — DR et ITAR » (ajoute un livrable et redéfinit une phase) ; retrait d'un tracker ou d'un champ de marquage obligatoire et renommage d'une norme refusés.
- Tests communs dans `normative-templates.test.ts` (12 : validité du schéma des deux gabarits, projets Spatial et Défense, montée Spatial 1.0 → 1.1, seuils versionnés dans un dérivé, gabarits livrés en lecture seule).

## Écarts
- Aucun.
