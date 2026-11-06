# Journal de la tâche T-0078

## Fait
- `ATHENA_PROTECTION_LEVEL` (`config.ts`, vide par défaut) ; valeur Helm `protectionLevel`. Une instance = un niveau, aucune donnée par organisation.
- `core/export-marking.ts` (`ExportMarker`) : mention en première et dernière lignes des CSV (BOM conservé en tête), YAML (`#`), Markdown (gras) ; `protection` dans les charges JSON ; saut de ligne ou guillemet dans la mention neutralisé.
- Exports marqués : conformité (CSV), gabarit (YAML), notes de version (Markdown) ; CSV de la matrice côté navigateur (`lib/protection.ts`, `markCsv`). En-tête `X-Athena-Protection-Level` sur toutes les réponses de l'API. `/auth/session` renvoie `protectionLevel`, y compris avant connexion.
- `ProtectionBanner.tsx` : bandeau sticky en tête de chaque page (rôle `note` étiqueté, lu par les lecteurs d'écran), bleu profond, jamais rouge, sans ombre ni dégradé ni arrondi (test sur le CSS). La barre latérale se décale de la hauteur du bandeau.
- Tests : `export-marking.test.ts` (6), bff (session avec niveau), `web19.test.tsx` (7 dont axe).

## Écarts
- Aucun. Les documents PDF n'existent pas dans Athena : les « documents générés » sont les notes de version (Markdown) et les exports CSV/YAML ; ils portent la mention.
