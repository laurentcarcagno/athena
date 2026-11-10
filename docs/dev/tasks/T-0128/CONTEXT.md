# Journal de la tâche T-0128

## Fait
- `packages/theming/src/runtime.ts` : `createThemeController` (état `theme` / `mode` / `density`, attributs configurables ou désactivés, `set`, `apply`, `reload`, `resolvedMode`, `subscribe`, événement DOM `themechange`, suivi de `prefers-color-scheme`), `storagePersistence` (JSON par défaut, `encode` / `decode` libres, `null` efface la clé).
- `packages/theming/src/react.ts` : `ThemeProvider`, `useTheme`, `useThemeState` (`useSyncExternalStore`) ; sous-export `@nuance/theming/react` ; React en dépendance pair facultative.
- Tests du paquet : 17 sur 17 (dont 7 pour le runtime et React, environnement jsdom par fichier) ; le test de découplage vérifie que seul `react.ts` importe React et que l'entrée principale ne l'exporte pas.
- `apps/web/src/lib/theme.ts` réécrit sur le contrôleur, **même API** (`ThemeChoice`, `THEME_CHOICES`, `THEME_KEY`, `readTheme`, `applyTheme`, `getTheme`, `setTheme`, `nextTheme`, `useTheme`, `initTheme`) : appelants et tests inchangés.
- Vérifications : web 420/420 ; `tsc` web ; e2e `theme.spec.ts` vert ; `pnpm visuel` 96 sur 96.

## Reste à faire
- Rien pour T-0128. Suivante : T-0129 (thème Hemeria en DTCG dans `packages/themes`, contrat sémantique d'Athena, CSS équivalent à `tokens.generated.css`).

## Décisions et pièges
- **Provisoire jusqu'à T-0129** : le CSS généré lit encore le mode dans `data-theme`. Athena configure donc le contrôleur avec `attributes: { theme: null, mode: 'data-theme', density: null }`. T-0129 passera à `data-theme="hemeria"` + `data-mode`, et devra adapter `theme.spec.ts` (il vérifie `data-theme` = `light` / `dark`) et `visuel.spec.ts` (même attribut).
- La mémoire garde le format historique (le seul mode sous `athena.theme`, clé effacée pour « système ») : aucun réglage existant n'est perdu. La préférence enregistrée sur le compte (migration 052) passe toujours par `setTheme`.
- `initTheme` prévient maintenant les abonnés (avant : non) : sans effet, il est appelé avant le premier rendu.
- Environnement e2e (vérifié le 2026-11-10) :
  - `gabarits.spec.ts` lancé seul échoue de deux façons qui ne sont pas des défauts : sans GitLab démarré, le message « Projet … créé. » arrive après le délai du test ; sur une base neuve, le rapport Traçabilité est masqué tant qu'aucun type de lien n'existe (`ProjectOverviewService.modules`), alors que `fiche.spec.ts`, qui précède dans la suite, en crée. Avec GitLab et `fiche` avant : 5 sur 5 ;
  - `deploy/dev` : `openbao-init` échoue (montage de `openbao/athena-api.hcl` refusé par Docker Desktop) ; sans effet sur les e2e.
- Remarque produit, à trancher plus tard : un projet créé depuis un gabarit qui porte des règles de couverture n'affiche pas le rapport Traçabilité tant qu'aucun type de lien n'a été écrit.

## Commandes utiles
```
pnpm --filter @nuance/theming test && pnpm --filter @nuance/theming build
pnpm --filter @athena/web test
cd deploy/dev && docker compose up -d     # GitLab compris pour gabarits.spec.ts
cd e2e && node global-setup.mjs && npx playwright test theme ; pnpm visuel
```

## Prompt de reprise
Lot 10 (thèmes), ADR-0004. T-0126 à T-0128 faites (`@nuance/theming` : moteur, runtime, React ; Athena passe par le contrôleur). Reprendre par T-0129 : créer `packages/themes` (`@nuance/themes`) avec le thème Hemeria en DTCG (clair, sombre) et le contrat sémantique d'Athena ; générer avec `theming build` un CSS dont chaque variable sémantique a la même valeur calculée que dans `tokens.generated.css` (test d'égalité) ; passer Athena à `data-theme="hemeria"` + `data-mode` (contrôleur, `theme.spec.ts`, `visuel.spec.ts`). Aucun changement visible : `cd e2e && pnpm visuel` 96 sur 96.
