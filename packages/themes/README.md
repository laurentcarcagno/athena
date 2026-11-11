# @nuance/themes

Thèmes au format W3C Design Tokens pour `@nuance/theming`. Données seulement : aucun code d'application.

- `contract.json` : modes attendus (`light`, `dark`), jetons obligatoires, paires de contraste WCAG 2.2 AA (4,5 pour le texte, 3 pour les contours et les repères).
- `base/theme.json` : jetons communs (abstrait) ; `<thème>/theme.json` : un dossier par thème. Vague 1 : `hemeria`, `contrast` (AAA), `catppuccin`, `nord`, `gruvbox`. Les thèmes communautaires sont dérivés de `palette.json` par `node tools/derive.mjs <thème>/palette.json` ; licences dans `NOTICE`.
- `pnpm test` contrôle chaque thème dans chaque mode ; un thème non conforme fait échouer le build des consommateurs.

Un produit consomme les thèmes avec le moteur, par exemple `packages/ui/scripts/build-themes.mjs` d'Athena (préfixe `ath-`, thème par défaut `hemeria`).

Hemeria a été converti depuis `packages/ui/design/DESIGN.md` 3.2.0 et `DESIGN.json` (T-0129) ; ses primitives sont `palette.*` (T-0130) et ses jetons communs viennent de `base` (T-0136).
