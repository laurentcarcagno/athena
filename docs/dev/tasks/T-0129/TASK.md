# T-0129 : thème Hemeria en DTCG et contrat d'Athena

- **Objectif** : `packages/themes` (`@nuance/themes`) porte le thème Hemeria (clair, sombre) et le contrat sémantique ; Athena charge le CSS généré par le moteur et pose `data-theme="hemeria"` + `data-mode`.
- **Critères d'acceptation** (testables) :
  - `@nuance/themes` : `pnpm test` vert (jetons obligatoires, 27 paires de contraste, deux modes) ;
  - chaque variable de `tokens.generated.css` a la même valeur calculée dans `themes.generated.css`, en clair et en sombre (test) ;
  - `@athena/ui/tokens.css` pointe sur le CSS du moteur ; contrôleur d'Athena sur `data-theme` (famille) et `data-mode` ;
  - tests web et e2e `theme.spec.ts` verts ; `pnpm visuel` 96 sur 96.
- **Fichiers concernés** : `packages/themes/` (`package.json`, `contract.json`, `hemeria/theme.json`, `check.mjs`, `README.md`) ; `packages/ui/scripts/build-themes.mjs`, `src/themes.test.ts`, `package.json`, `.storybook/preview.tsx` ; `apps/web/src/lib/theme.ts` et tests ; `e2e/tests/theme.spec.ts`, `visuel.spec.ts` ; `.gitignore`.
- **Hors périmètre** : retrait des primitives de `styles.css` (T-0130), retrait de `build-tokens.mjs` (T-0131).
- **Dépendances** : T-0127, T-0128.
