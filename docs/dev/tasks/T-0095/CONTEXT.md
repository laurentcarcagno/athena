# Journal de la tâche T-0095

## Fait
- **Charte (skill `design:improve` puis `design:check`)** : le thème sombre existait en `proposed` (53 tokens, 64 paires de contraste dont les sombres, toutes au niveau AA). Il passe à `stable` (décision **D-018**), `meta.version` 3.1.0. Nouveau bloc `tokens.semantic.darkPrimitiveMap` (réaffectation des primitives par rôle). `DESIGN.md` : section 2.1.1 (suite) sur la sélection, la réaffectation et les zones, journal D-018, listes « décisions en attente » et « écarts connus » mises à jour, registre régénéré (`validate-design --write`). `validate-design --strict` : OK (le script du projet et celui du skill).
- `scripts/build-tokens.mjs` génère, depuis `DESIGN.json`, une variable par token sémantique pour les deux thèmes dans `tokens.generated.css` (`--ath-surface-*`, `--ath-text-*`, `--ath-border-*`, `--ath-action-*`, `--ath-state-*`, `--ath-focus-*`) et les deux sélecteurs sombres (`:root[data-theme="dark"]` et `@media (prefers-color-scheme: dark)` sur `:root:not([data-theme="light"])`), avec `color-scheme`.
- `styles.css` : trois **zones** (surface inverse, bouton plein d'action, bouton neutre plein) qui redéclarent localement les primitives qu'elles emploient comme texte sur aplat ; neuf règles passent des mélanges `color-mix` aux variables sémantiques (valeurs identiques en clair : #9E1616, #166337, #6D4C00, #005E96) ; fonds de modale et de tiroir sur `--ath-surface-scrim`. Aucune couleur sombre en dur : `lint-design` reste vert, palette inchangée.
- Interface : `lib/theme.ts` (réglage système, clair ou sombre ; `localStorage` `athena.theme` ; valeur illisible ou stockage inaccessible = système ; attribut `data-theme` sur `html`, posé avant le premier rendu), `ThemeToggle` (barre latérale, bascule au clavier, état dit en texte), textes FR/EN.
- Tests : `tokens.test.ts` (+6 : sélecteurs, mêmes clés dans les deux thèmes, valeurs sombres, valeurs claires inchangées, aucune référence non résolue, aucune couleur sombre en dur), `theme.test.tsx` (6 dont axe), e2e `theme.spec.ts` (système clair et sombre mesurés, bascule au clavier, choix explicite prioritaire, mémorisation après rechargement, **axe avec contraste** dans les deux thèmes sur six pages, capture jointe au rapport).

## Décisions
- Réaffectation des primitives plutôt que refonte des 250 usages : la feuille de style garde ses références ; le thème clair reste identique par construction (les zones redéclarent la même valeur).
- Changements visibles minimes en clair : trait de sélection du workflow et de la tuile glissée en `border.focus` (bleu ciel) au lieu de Tricolor Blue ; flèche de tri des en-têtes en mélange texte inverse / surface inverse.
- Le contraste en sombre est vérifié par axe dans le navigateur (couleurs effectives après réaffectation) en plus des 64 paires calculées de `DESIGN.json`.

## Limites déclarées
- Le skill `design:improve` prévoit un arrêt de validation après l'inventaire ; la consigne de l'utilisateur (« ne t'arrête qu'à la fin du lot ») et le périmètre fixé par la fiche l'ont remplacé : l'inventaire est consigné ci-dessus, aucun token existant n'est renommé ni retiré.
- Bordure des contrôles (`mute-ink`) en sombre : `border.control` (#5C95BB, 5,0:1) ; les boutons contour utilisent la couleur du titre plutôt que `border.strong`.
- Les graphiques SVG du tableau de bord reprennent les mêmes primitives réaffectées ; aucune palette de série n'a été ajoutée.

## Écarts
- Aucun.
