# @nuance/themes

Thèmes au format W3C Design Tokens pour `@nuance/theming`. Données seulement : aucun code d'application.

- `contract.json` : modes attendus (`light`, `dark`), jetons obligatoires, paires de contraste WCAG 2.2 AA (4,5 pour le texte, 3 pour les contours et les repères).
- `<thème>/theme.json` : un dossier par thème. Aujourd'hui : `hemeria` (identité Hemeria, angles droits, aucune ombre).
- `pnpm test` contrôle chaque thème dans chaque mode ; un thème non conforme fait échouer le build des consommateurs.

Un produit consomme les thèmes avec le moteur, par exemple `packages/ui/scripts/build-themes.mjs` d'Athena (préfixe `ath-`, thème par défaut `hemeria`).

Hemeria a été converti depuis `packages/ui/design/DESIGN.md` 3.2.0 et `DESIGN.json` (T-0129). Les primitives `color.*` et leur réaffectation en sombre restent tant que `styles.css` les lit (retirées en T-0130).
