# T-0034 : recherche plein texte

- Migration 020 : colonne générée `artifact.search_tsv` (jsonb_to_tsvector, valeurs textuelles) + index GIN.
- ATQL : `text ~ "mots"` (syntaxe websearch : "expression", OR, -exclusion). Seul l'opérateur `~` est accepté.
- Sécurité : refusé si le lecteur a des champs à lecture restreinte (évite de déduire un champ masqué).
- Tests : atql.test.ts, field-permissions.test.ts. `pnpm check` vert (261 tests API).
