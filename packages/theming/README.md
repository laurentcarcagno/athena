# @nuance/theming

Moteur de thèmes générique, sans dépendance au produit qui l'emploie (ADR-0004 d'Athena).

- **Format** : jetons W3C Design Tokens (`{ "$value": … }`), alias `{chemin.du.jeton}` complets ou inclus dans une chaîne.
- **Thème** : `name`, `extends` (héritage), `tokens` (communs), `modes.<mode>` (surcharges), `meta.abstract` (thème de base non émis).
- **Contrat** : modes attendus, mode par défaut, jetons obligatoires, paires de contraste avec leur seuil. Le produit le fournit.
- **Contrôle** : chaque thème × mode doit définir les jetons obligatoires et tenir chaque paire (ratio WCAG 2.x tronqué au centième).
- **CSS** : `:root[data-theme="<nom>"]` porte le mode par défaut ; chaque autre mode n'émet que ses différences, sous `[data-mode="<mode>"]` et, pour `light` et `dark`, sous `prefers-color-scheme` quand aucun mode n'est imposé.

```
theming check --contract contrat.json themes/*.json
theming build --contract contrat.json --out themes.css --prefix ath- --default hemeria themes/*.json
```

La génération refuse d'émettre un thème non conforme.

## Runtime navigateur

```ts
import { createThemeController, storagePersistence } from '@nuance/theming';
const theme = createThemeController({
  defaults: { theme: 'hemeria', mode: 'system', density: 'normal' },
  themes: ['hemeria', 'nord'], modes: ['system', 'light', 'dark'], densities: ['normal', 'compact'],
  persistence: storagePersistence({ key: 'app.theme' }),
});
theme.apply();                 // avant le premier rendu
theme.set({ mode: 'dark' });   // applique, mémorise, prévient (abonnés et événement DOM `themechange`)
```

- Attributs posés sur `<html>` : `data-theme`, `data-mode` (absent pour `system`), `data-density` ; noms configurables, `null` pour ne pas poser un axe.
- Valeur mémorisée inconnue ou illisible : la valeur par défaut s'applique. Mémoire en panne : le choix vaut pour la session.
- React (facultatif, dépendance pair) : `import { ThemeProvider, useTheme, useThemeState } from '@nuance/theming/react'`.
