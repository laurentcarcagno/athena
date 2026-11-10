# Journal de la tâche T-0127

## Fait
- 2026-11-10, avant la tâche, à la demande de l'utilisateur :
  - « Configurer » de l'écran Tracker devient un bouton-icône (engrenage, icône `settings` ajoutée à `Btn`) : le débordement à 375 px a disparu (commit 8d4fee0) ;
  - « ticket » remplace « item » dans tous les textes affichés : dictionnaires FR et EN, messages de l'API (ATQL `linkedTo`, circuit d'approbation, contrôle export, montée de gabarit), `docs/user/GUIDE.md` ; le test de vocabulaire refuse « item » (commit 2f2d73f) ;
  - références visuelles reprises après ces deux changements (`pnpm visuel:reference`, 96 captures).
- `packages/theming` (`@nuance/theming` 0.1.0) :
  - `tokens.ts` : aplatissement DTCG, héritage (`extends`), couches communes puis par mode, résolution des alias complets et inclus, erreurs explicites ;
  - `color.ts` : lecture `#RGB(A)`, `#RRGGBB(AA)`, `rgb(a)()`, composition alpha, ratio WCAG tronqué au centième ;
  - `check.ts` : contrat (modes, mode par défaut, jetons obligatoires, paires de contraste) et constats par thème × mode ;
  - `css.ts` : `:root[data-theme]` (+ `:root:not([data-theme])` pour le thème par défaut), autres modes en différence sous `[data-mode]` et `prefers-color-scheme` ; thèmes `meta.abstract` non émis ;
  - `cli.ts` / `bin.ts` : `theming check`, `theming build` (refuse d'émettre un thème non conforme) ;
  - tests : 9 sur 9 ; `tsc` sans erreur ; essai réel de la CLI (codes 0, 1, 2).

## Résultats des tests
- Web 420/420, `@athena/ui` 52/52, API ciblés (ATQL, approbation, montée de gabarit, accès) 70/70.
- e2e complète après le changement de vocabulaire : 40 réussis, 4 échecs, 2 ignorés. Trois échecs venaient de mon remplacement (expressions régulières « L’item », « Formulaire d’un item », libellé « Item cible », nom normatif « Review Item Discrepancies (RID) » renommé à tort puis rétabli) : corrigés et rejoués verts (approbation, liens, dérivation de gabarit).
- **Échec antérieur, non causé par le lot** : `gabarits.spec.ts`, création d'un projet depuis les gabarits Spatial et Défense : le projet est créé mais le message « Projet SPA1 créé. » n'est pas vu. Il échoue aussi sur le code sans mes changements (vérifié en mettant ces changements de côté). Hypothèse non vérifiée : GitLab local non démarré dans cette session (création plus lente que le délai d'attente du test).

## Reste à faire
- Rien pour T-0127. Suivante : T-0128 (runtime navigateur et React, remplace `apps/web/src/lib/theme.ts`).

## Décisions et pièges
- Le ratio de contraste est **tronqué** au centième (4,499 échoue à 4,5) : plus strict qu'un arrondi, comme `validate-design`.
- Dans un mode autre que celui par défaut, seules les variables qui changent sont émises : le bloc du mode par défaut doit donc toujours être présent (il l'est : un thème émis l'est toujours avec son mode par défaut).
- Un mode imposé (`data-mode="light"`) l'emporte sur la préférence système, car le bloc système porte `:not([data-mode])`.
- Remplacement de vocabulaire : le script ne traite que les chaînes entre guillemets ; les expressions régulières des tests et les noms propres (gabarits normatifs) sont à vérifier à la main.

## Commandes utiles
```
pnpm --filter @nuance/theming test
pnpm --filter @nuance/theming build && node packages/theming/dist/bin.js check --contract <c.json> <thèmes…>
cd e2e && pnpm visuel
```

## Prompt de reprise
Lot 10 (thèmes), ADR-0004. T-0126 et T-0127 faites (`@nuance/theming` : résolution, contraste, CSS, CLI). Reprendre par T-0128 : runtime dans `packages/theming` (`applyTheme` par attributs `data-theme` / `data-mode` / `data-density`, préférence système, persistance injectable, événement de changement) et liaisons React optionnelles (`ThemeProvider`, `useTheme`, React en dépendance pair, sous-export `@nuance/theming/react`) ; remplacer `apps/web/src/lib/theme.ts` sans changement visible. e2e `theme.spec.ts` vert ; `cd e2e && pnpm visuel` 96 sur 96.
