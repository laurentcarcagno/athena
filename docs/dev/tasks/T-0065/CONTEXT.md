# Journal de la tâche T-0065

## Fait
- Parseur : prédicats `suspect()`, `linkedTo(CLÉ[, "type"])`, `notLinked(["type"])` (nouveaux nœuds `suspect`, `linkedTo`, `notLinked`), validation des arguments avec position d'erreur, noms insensibles à la casse ; `suspect = x` reste un champ.
- Compilation : sous-requêtes `exists` paramétrées sur `artifact_link`, clé résolue par `resolve_artifact` (alias compris), dans les deux sens, jamais de concaténation.
- Web : case « Liens suspects » (puce) dans la barre de filtres, conversion puces ⇄ ATQL (`suspect()`), suggestions de mots-clés ; aide du guide.
- Tests : `atql-links.test.ts` (37 avec les existants), `filter-query.test.ts`, `web10.test.tsx`.

## Décisions
- `suspect()` retient les items à l'une ou l'autre extrémité d'un lien suspect (la source à revoir, la cible modifiée) ; à réviser si la revue ne doit voir que les sources.
- `notLinked(...)` et `linkedTo(...)` ne distinguent pas la direction (comme l'onglet Liens).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0066 (vue Arbre).
