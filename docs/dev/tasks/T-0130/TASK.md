# T-0130 : styles.css sans primitives, partie 1 (couleurs)

- **Objectif** : `packages/ui/src/styles.css` ne lit plus aucune primitive (`--ath-color-*`) ni couleur littérale ; plus de redéfinition locale de variables ; plus de réaffectation sombre des primitives.
- **Critères d'acceptation** : 0 `--ath-color-*`, `rgba()`, `color-mix()`, hexadécimal dans `styles.css` (test et lint) ; `@nuance/themes` conforme ; tests web et `theme.spec.ts` (axe, deux modes) verts ; `pnpm visuel` 96 sur 96.
- **Fichiers** : `packages/ui/src/styles.css`, `scripts/lint-design.mjs`, `src/themes.test.ts`, `src/components.test.tsx` ; `packages/themes/hemeria/theme.json`, `contract.json` ; `packages/theming/src/check.ts` (fond translucide `over`) et son test.
- **Hors périmètre** : typographie, espacements, tailles, z-index (T-0131).
