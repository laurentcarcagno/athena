# T-0132 : typographie visible

- **Objectif** : casse de phrase, échelle par rôles, titres unifiés, graisses chargées, prose limitée, dates localisées.
- **Critères d'acceptation** : aucun `text-transform: uppercase` ; un seul traitement par niveau de titre (test) ; graisses Plex Sans 500 et Mono 600 chargées ; prose ≤ 72 caractères ; aucune date en ISO tronqué (test) ; captures revues ; tests et e2e verts.
- **Fichiers** : `packages/themes/hemeria/theme.json`, `contract.json` ; `packages/ui/src/styles/*.css`, `components.tsx`, `themes.test.ts` ; `apps/web/src` (titres des pages et composants, `lib/dates.ts`, `main.tsx`, `test-setup.ts`, `typographie.test.ts`, trois tests de dates).
