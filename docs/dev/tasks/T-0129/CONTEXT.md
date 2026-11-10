# Journal de la tâche T-0129

## Fait
- `packages/themes` (`@nuance/themes` 0.1.0, données seulement) :
  - `hemeria/theme.json` : converti une fois depuis `DESIGN.md` 3.2.0 (couleurs, espacement, rayons, typographie) et `DESIGN.json` (sémantique claire et sombre, surcouches, réaffectation sombre des primitives), même logique que `build-tokens.mjs` ; les références deviennent des alias `{color.…}`, `{surface.…}`. Script de conversion non versionné : le JSON est désormais la source ;
  - `contract.json` : modes `light` / `dark`, 112 jetons obligatoires (tout ce que lit `styles.css` aujourd'hui), 27 paires de contraste (texte 4,5 ; contours et focus 3) ;
  - `check.mjs` (`pnpm test`) : Hemeria conforme dans les deux modes.
- `packages/ui/scripts/build-themes.mjs` génère `src/themes.generated.css` (préfixe `ath-`, thème par défaut `hemeria`, contrôle avant émission) ; branché dans `tokens`, `build`, `typecheck`, `test`. `@athena/ui/tokens.css` pointe sur ce fichier ; Storybook aussi.
- `src/themes.test.ts` : chaque variable de l'ancien CSS a la même valeur calculée dans le nouveau, en clair et en sombre (résolution des `var()` comme le navigateur) ; aucune variable en plus.
- Athena : contrôleur sur `data-theme="hemeria"` et `data-mode` ; tests unitaires et e2e (`theme.spec.ts`, `visuel.spec.ts`) passés de `data-theme` à `data-mode`.
- **Défaut corrigé en passant** (antérieur au lot, révélé par un échec intermittent de `theme.spec.ts`) : les préférences du compte, chargées après l'affichage, écrasaient un thème ou une langue choisis entre-temps. `PreferencesProvider` n'applique plus la préférence du compte si le réglage local a changé depuis le début du chargement. Test de non-régression dans `global-nav.test.tsx` (échoue sans la correction, vérifié).
- Vérifications : `@nuance/themes` vert ; `@athena/ui` 56/56 et lint ; web 421/421 ; `theme.spec.ts` 3 passes sur 3 ; `pnpm visuel` 96 sur 96.

## Reste à faire
- Rien pour T-0129. Suivante : T-0130 (`styles.css` en couches sémantique et composant, partie 1 : couleurs).

## Décisions et pièges
- Le contrat exige encore les primitives `color.*`, `space.*`, `type.*`, `radius.*`, `motion.*` parce que `styles.css` les lit. T-0130 et T-0131 les retireront du contrat au fur et à mesure.
- En sombre, la réaffectation des primitives (`color.instrument-white` = `{surface.default}`…) est conservée telle quelle (D-018) : elle disparaîtra avec les usages de primitives en T-0130.
- `tokens.generated.css` est encore généré, mais seulement pour le test d'égalité ; il disparaît en T-0131 avec `build-tokens.mjs`.
- Les scripts `pnpm` passent par `cmd` sous Windows : pas de joker `*` dans une commande ; d'où `check.mjs`.
- Fixture du test de préférences : le faux serveur doit répondre avec l'état **au moment de la requête**, et le contrôleur de thème doit être réinitialisé (`initTheme()`), sinon le test passe à tort.

## Commandes utiles
```
pnpm --filter @nuance/themes test
pnpm --filter @athena/ui test        # régénère tokens et thèmes, test d'égalité
cd e2e && node global-setup.mjs && npx playwright test theme ; pnpm visuel
```

## Prompt de reprise
Lot 10 (thèmes), ADR-0004. T-0126 à T-0129 faites (moteur, runtime, `@nuance/themes` avec Hemeria et le contrat ; Athena sur `data-theme="hemeria"` + `data-mode`). Reprendre par T-0130 : dans `packages/ui/src/styles.css`, remplacer toute lecture de `--ath-color-*` par des variables sémantiques ou de composant ; supprimer les redéfinitions locales de primitives (`.ath-sidebar`, `.ath-th`, boutons pleins…) au profit de jetons dédiés (surface inverse, texte sur action) ajoutés au contrat et à Hemeria ; retirer la réaffectation sombre des primitives ; étendre le lint (`rgba`, `#RGB`, `color-mix`). Critères : 0 `--ath-color-*` dans `styles.css`, lint vert, `pnpm visuel` 96 sur 96, axe vert dans les deux modes (`theme.spec.ts`).
