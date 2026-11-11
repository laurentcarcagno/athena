# T-0140 : thèmes de la vague 2

- **Objectif** : quatre thèmes appréciés de la communauté en plus de la vague 1 : Solarized, Dracula (variante claire Alucard), Tokyo Night (Night, Day), Rosé Pine (Main, Dawn).
- **Critères d'acceptation** (mêmes que T-0136) : chaque thème, dans chaque mode, conforme au contrat (78 paires, AA) ; axe-core sans violation sur six écrans par thème et par mode ; choix dans le Profil et dans Administration > Apparence ; licences dans `NOTICE` ; Hemeria inchangé (visuel 96/96) ; tests et e2e verts.
- **Fichiers** : `packages/themes` (`{solarized,dracula,tokyo-night,rose-pine}/palette.json` et `theme.json`, `tools/derive.mjs`, `NOTICE`, `README.md`, thèmes de la vague 1 re-dérivés) ; `apps/web/src/lib/theme.ts` ; `e2e/tests/themes.spec.ts`, `apercu-themes.spec.ts` ; `docs/admin/INSTALLATION.md`.
