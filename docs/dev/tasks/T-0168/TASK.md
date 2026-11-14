# T-0168 : thèmes « Athena arrondi » et « GitHub »

- **Objectif** : ajouter deux thèmes à `@nuance/themes` (ADR-0007 § 2.4), chacun dans les deux modes exigés par le contrat : « Athena arrondi » (palette Athena, rayon 8 px, bordure 1 px, aucune ombre) et « GitHub » (inspiré de GitHub Primer, clair et sombre, dérivé d'une `palette.json`). Ajouter les jetons sémantiques « fusionné » (violet : `#6E4BB8` clair, `#A98BEA` sombre dans Athena arrondi) et « brouillon » (gris), et le jeu de statuts succès / fusionné / bloquant / brouillon / avertissement / information avec leurs paires texte-fond au contrat.
- **Critères d'acceptation** (testables) :
  - `pnpm test` de `packages/themes` : chaque thème, chaque mode, toutes les paires de contraste AA (4,5 texte ; 3 contours et repères) ;
  - le sélecteur de thème des préférences propose les deux thèmes (test web) ;
  - aucun dégradé ni ombre (contrôle existant), composants lisant seulement des jetons sémantiques ou de composant.
- **Fichiers concernés** : `packages/themes/contract.json`, `packages/themes/base/theme.json`, `packages/themes/athena-arrondi/` et `packages/themes/github/` (`palette.json`, `theme.json`), `packages/themes/tools/derive.mjs`, `packages/themes/NOTICE` (licence de la palette GitHub), `packages/ui/scripts/build-themes.mjs`, sélecteur de thème dans `apps/web`.
- **Hors périmètre** : widgets du tableau de bord (T-0171 et suivantes) ; modification du thème Athena existant (il garde ses angles droits).
- **Dépendances** : T-0167 (faite). Référence visuelle : `docs/dev/maquettes/lot13-tableau-de-bord.html` (jetons des deux thèmes en tête de fichier).
