# Vérification du lot 13 : tableau de bord modulaire (2026-11-13)

Décisions : `docs/dev/DECISIONS/ADR-0007-tableau-de-bord-modulaire.md`. Plan : `docs/dev/tasks/LOT13-PLAN.md`.
Consigne de l'utilisateur pour ce lot : tests ciblés seulement, **aucun test e2e**. Les critères qui exigent un navigateur réel
(e2e, captures de référence, axe en navigateur par thème) ne sont donc **pas exécutés** ; ils sont listés en fin de document.

## Critères tâche par tâche

| Tâche | Critère | Preuve | État |
| --- | --- | --- | --- |
| T-0168 | Thèmes « Athena arrondi » et « GitHub », deux modes, toutes les paires AA ; jetons fusionné / brouillon | `pnpm test` de `packages/themes` : 11 thèmes, 84 paires (82 avant) ; test web du sélecteur (`theme.test.tsx`) | tenu |
| T-0169 | Conversion S/M/L/XL → colonnes sans perte ; chevauchement ou hors grille → 422 ; plafond de 24 ; ancien client | `core/dashboard.test.ts` (disposition 2D) ; `toGrid` idempotente, `size` conservé | tenu (sans migration : voir écart 1) |
| T-0170 | Catalogue par rôle ; 403 sur un genre interdit ; défauts sans chevauchement | `core/dashboard.test.ts` (catalogue, refus) | tenu |
| T-0171 | Grille 2D en vue ; ordre mobile ; classes de position sans attribut `style` | `dashboard-cards.test.tsx`, `lib/grid.test.ts` ; CSS : 1 colonne sous 720 px | tenu côté jsdom ; e2e non rejoué |
| T-0172 | Édition : pointeur et clavier, annonces, réglages, brouillon, Annuler / Enregistrer / Rétablir | `Dashboard.test.tsx`, `dashboard-cards.test.tsx`, `chart-card.test.tsx` | tenu côté jsdom ; e2e non rejoué |
| T-0173 | Ligne commune et états vides par genre ; aucune information par la couleur seule | `widget-cards.test.tsx` (libellés des états, axe) ; paires `state.merged` et `state.draft` au contrat | tenu |
| T-0174 | `GET /kpis` exact sur NOVA ; quatre états du projet ; chiffres de la Santé = recherche « bloquants » | `agile/kpi.test.ts` (compte égal au total de la recherche, `blocked()` ATQL) ; `widget-cards.test.tsx` | tenu ; e2e non rejoué |
| T-0175 | Pipelines GitLab (12 dernières, taux, cache 30 s), animation coupée sous `prefers-reduced-motion`, état vide « Relier un dépôt » | `gitcode/pipelines.test.ts` (GitLab simulé) ; CSS `@media (prefers-reduced-motion: reduce)` | tenu |
| T-0176 | `GET /quality` « non relié » sans fournisseur ; badges SonarQube masqués sans connexion ; « Relier SonarQube » | `gitcode/pipelines.test.ts` (contrat), `widget-cards.test.tsx` | tenu |
| T-0177 | Galerie des widgets (genre × 4 états) ; démonstration LUMEN | page `/widgets-test`, test de rendu et d'axe ; `seedLumen` dans `tools/dev-start.mjs` | tenu ; démonstration non lancée, captures non reprises |
| T-0178 | Vérification, mesure à 24 widgets, guide | rendu de 24 widgets : 49 ms (jsdom), sans chevauchement ; `docs/user/GUIDE.md` mis à jour | tenu |

## Écarts

1. **Migration 062 non créée.** La disposition est du JSON ; la conversion vers la grille se fait à la lecture (`toGrid`), sans perte et idempotente. La migration indicative du plan n'était pas nécessaire. Prochaine migration réelle : 062.
2. **Largeur par défaut** d'une carte sans taille : S (4 colonnes), comme avant le lot.
3. **Non exécuté sur consigne de l'utilisateur** : e2e complet (`tableau-de-bord.spec.ts` et autres, `themes.spec.ts` étendu aux deux thèmes), références visuelles (`pnpm visuel:reference`), axe en navigateur sur 11 thèmes × 2 modes. Le contraste des couleurs est vérifié par le contrat des thèmes (84 paires) ; axe en jsdom ne mesure pas les contrastes.
4. **SonarQube** : aucun fournisseur branché (lot 14) ; le contrat `QualityProvider` est en place.
5. **Démonstration LUMEN** écrite mais non lancée (infrastructure de développement non démarrée).

## Tests exécutés (ciblés)

`packages/themes` (check) · `@athena/ui` (lint, tests) · API : `core/dashboard`, `agile/kpi`, `gitcode/pipelines`, `atql/atql-planning`, `openapi` · web : `lib/grid`, `lib/theme`, `Dashboard`, `dashboard-cards`, `chart-card`, `widget-cards`, `web2`, `web11`, `a11y`, navigation et rail · `tsc` API et web.
