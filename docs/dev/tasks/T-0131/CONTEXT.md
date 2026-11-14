# Journal de la tâche T-0131

## Fait
- Athena : jetons `font.family` (sans, mono), `font.size` (xs 11, sm 12, md 13, ml 14, lg 15, xl 16, 2xl 26, stat 30), `font.weight`, `font.tracking`, `font.leading`, `space` (2xs, base, 2xl, 3xl ajoutés), `border-width`, `size` (contrôles, boutons-icônes, cible minimale, barre latérale, dialogues, notifications), `z` (base 0, sticky 50, dropdown 70, drawer 900, modal 1000, toast 1100, banner 1300), `motion.default`. Contrat : 158 jetons obligatoires.
- Feuille convertie à valeurs identiques : tailles, graisses, interlettrages, interlignes, police mono, couches (écarts locaux en `calc(niveau ± n)`, mêmes nombres), durées, épaisseurs de bordure, espacements de l'échelle, tailles nommées des composants.
- `styles.css` n'est plus qu'une liste ordonnée de 13 `@import` (`src/styles/` : base, controls, containers, shell, views, tickets, traceability, responsive, layout-editor, documents, topbar, rail, mobile-charts), dans l'ordre exact de l'ancienne feuille.
- Ancien générateur retiré (`build-tokens.mjs`, `tokens.generated.*`, `tokens.test.ts`, export `tokens` inutilisé, dépendance `yaml`). Ses valeurs calculées sont figées dans `src/__fixtures__/athena-legacy.json` : le test compare le CSS du moteur à cette référence (clair et sombre).
- Garde-fous de l'audit déplacés dans `themes.test.ts` : texte ≥ 11 px par les jetons (F-05), cible ≥ 24 px (F-06), pas de couleur de bordure de signal pour du texte.
- Vérifications : `@athena/ui` 41/41, lint et charte ; web 421/421 ; `theme.spec.ts` vert ; `pnpm visuel` 96 sur 96.

## Reste à faire
- Rien. Suivante : T-0132 (typographie visible : casse de phrase, nouvelle échelle, titres unifiés).

## Décisions et pièges
- Les espacements hors échelle (5, 6, 9, 10, 14, 18 px…) restent écrits tels quels : ils disparaissent avec la nouvelle échelle en T-0132 (changement visible).
- `-2px` (filet des onglets) et `-1px` (masquage accessible) sont structurels, pas des espacements.
- Les tests qui lisent la feuille doivent lire `styles.css` **et** ses imports (`readStyles()` dans les tests de `@athena/ui`) ou la partie concernée (`web19.test.tsx` lit `styles/documents.css`).

## Prompt de reprise
Lot 10, ADR-0004. T-0126 à T-0131 faites (plomberie terminée, aucune valeur de thème dans la feuille). Reprendre par T-0132 : casse de phrase partout (plus de `text-transform: uppercase`), échelle 22 / 16 / 14 / 12 (+ display 28), titres de section et de carte unifiés, graisses Plex Sans 500 et Mono 600 chargées, prose ≤ 72 caractères, dates localisées. Prendre d'abord `pnpm visuel:reference` ? Non : comparer d'abord, puis reprendre la référence **après** revue des captures.
