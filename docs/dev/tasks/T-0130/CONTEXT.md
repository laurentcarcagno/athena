# Journal de la tâche T-0130

## Fait
- `styles.css` converti à valeurs calculées identiques :
  - hors contexte, chaque primitive devient le jeton sémantique de même valeur dans les deux modes (table D-018 : `instrument-white` → `surface-default`, `sovereign-deep-blue` → `text-heading`…) ; `signal-*` → `state-*-border` ; tricolore → `brand-primary` / `brand-accent` ;
  - les contextes qui redéfinissaient les primitives (barre latérale et menus Favoris/Récents, en-tête de tableau, en-tête de modale, en-tête de colonne du Board, bandeau de protection ; boutons et étiquettes pleins) lisent directement `surface-inverse`, `text-on-inverse`, `action-primary-*`, `action-deep-*` ; leurs redéfinitions locales sont supprimées ;
  - `color-mix()` et `rgba()` de la surface inverse → jetons `inverse.*` (textes atténués aux mêmes valeurs, surcouches).
- Hemeria : `color.*` renommé `palette.*` (primitives propres au thème) ; réaffectation sombre des primitives supprimée ; jetons `inverse.*` et `brand.*` ajoutés. Contrat : 105 jetons obligatoires, 31 paires (dont 4 sur la surface inverse).
- Moteur : une paire de contraste peut porter `over` (surface opaque sous un fond translucide) ; test.
- Lint : dans les feuilles de style, primitive de thème, `rgba`/`hsla`/`color-mix` et hexadécimal interdits.
- **Défaut corrigé** : le bouton « + » des en-têtes de colonne du Board (ghost sur surface inverse) prenait la couleur de la surface : invisible. Il a désormais texte et contour clairs.
- **Changement assumé, invisible dans les captures** : l'anneau de focus du bouton principal est `border-focus` comme partout (avant : la couleur de fond du bouton, différente en sombre).
- Vérifications : moteur 18/18, `@athena/ui` 57/57 et lint, thèmes conformes, web 421/421, `theme.spec.ts` vert, `pnpm visuel` 96 sur 96.

## Reste à faire
- Rien. Suivante : T-0131.

## Décisions et pièges
- Les heredocs bash mangent les `\` des expressions régulières (et peuvent insérer un caractère 0x08 pour `\b`) : écrire les fichiers contenant des regex avec l'outil d'édition.
- Classes rendues dans un contexte inverse : `.ath-sidebar` (dont `.ath-flyout*`, `.ath-iconbtn` du pied), `.ath-th`, `.ath-modal__header` (bouton de fermeture `.ath-icon-btn`), `.ath-column__head` (bouton « + »), `.ath-protection`. `.ath-iconbtn` dans un tableau (`.ath-td .ath-iconbtn`) est sur surface claire.

## Prompt de reprise
Lot 10, ADR-0004. T-0126 à T-0130 faites. Reprendre par T-0131 : typographie, espacement, tailles, bordures, z-index (7 niveaux), mouvement en jetons ; `styles.css` découpé par composant ; retrait de `build-tokens.mjs` et du front matter comme source. Aucun changement visible : `pnpm visuel` 96 sur 96.
