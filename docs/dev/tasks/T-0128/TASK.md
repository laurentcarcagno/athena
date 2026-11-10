# T-0128 : runtime de thème et liaisons React

- **Objectif** : runtime navigateur générique dans `@nuance/theming` et liaisons React facultatives ; `apps/web/src/lib/theme.ts` s'appuie dessus sans changement visible.
- **Critères d'acceptation** (testables) :
  - attributs posés sur l'élément racine (noms configurables, axe désactivable) ; `system` retire l'attribut de mode ;
  - choix mémorisé par un adaptateur injectable ; valeur inconnue ou illisible ignorée ; mémoire en panne sans effet bloquant ;
  - mode effectif (préférence système) et abonnés prévenus au changement du système en mode `system` ; événement DOM `themechange` ;
  - React : `ThemeProvider`, `useTheme`, `useThemeState` ; React importé par `react.ts` seulement, sous-export `@nuance/theming/react`, dépendance pair facultative ;
  - `lib/theme.ts` garde son API et la clé `athena.theme` ; tests web, e2e `theme.spec.ts` verts ; `pnpm visuel` 96 sur 96.
- **Fichiers concernés** : `packages/theming/src/runtime.ts`, `react.ts`, `runtime.test.tsx`, `index.ts`, `theming.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md` ; `apps/web/src/lib/theme.ts`, `apps/web/package.json`.
- **Hors périmètre** : famille de thème et densité dans Athena (T-0129, T-0135, T-0136).
- **Dépendances** : T-0127.
