# T-0131 : styles.css sans primitives, partie 2 ; retrait de l'ancien générateur

- **Objectif** : typographie, espacement, bordures, tailles, couches et mouvement en jetons ; feuille découpée ; `build-tokens.mjs` et le front matter ne produisent plus de CSS.
- **Critères d'acceptation** : aucun `font-size`, `font-weight`, `letter-spacing`, `line-height`, `z-index` ni durée littéraux (test et lint) ; z-index en 7 niveaux ; `pnpm visuel` 96 sur 96 ; tests web et `theme.spec.ts` verts.
- **Fichiers** : `packages/ui/src/styles.css` et `src/styles/*.css` (13 parties) ; `packages/themes/hemeria/theme.json`, `contract.json` ; `packages/ui/package.json`, `src/index.ts`, `src/themes.test.ts`, `src/components.test.tsx`, `src/__fixtures__/hemeria-legacy.json` ; suppression de `scripts/build-tokens.mjs`, `src/tokens.test.ts`, `src/tokens.generated.*` ; `DESIGN.md` § 2.1.1 et § 10.3 ; `apps/web/src/web19.test.tsx`.
