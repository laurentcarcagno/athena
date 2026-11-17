# T-0195 : rôles sémantiques probabilité et impact (B13)

- Migration 070 : contrainte `semantic_role` étendue à `probability` et `impact` ; ces rôles exigent un champ `number` (`roleTypeProblems`).
- Type livré « Risque » : champs `probability` et `impact` (1 à 5) avec leurs rôles.
- Recherche (`atql/search.service.ts`) : un ticket dont le tracker porte un des rôles reçoit `risk: { probability, impact, criticality }` ; criticité = produit, calculée, nulle si l'un manque. Sans rôle, pas de `risk`.
- `RisksTab` lit `hit.risk`, retombe sur les noms de champ `probability`, `impact`, `criticality`, et classe lui-même par criticité décroissante (la requête n'impose plus `ORDER BY criticality`). Les rôles sont proposés dans le créateur de tracker.
- Tests : `core/risk-roles.test.ts`, `risks-report.test.tsx`. API 742/742, web 631/631.
- Non fait : « assignation dans les gabarits » : aucun gabarit livré (Spatial, Défense) n'a de tracker de risques ; seul le type livré est doté. Widget `risks` du tableau de bord : requête inchangée (`ORDER BY criticality`, par nom de champ). Libellés des rôles dans le créateur : clés brutes comme les autres rôles.
