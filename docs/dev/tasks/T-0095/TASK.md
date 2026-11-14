# T-0095 : Thème sombre

- **Lot** : 7 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Ajouter le thème sombre dans DESIGN.json/DESIGN.md puis dans l'interface (skill `design:improve` puis `design:check`).
- **Fichiers concernés** :
  - `packages/ui/design/DESIGN.json`
  - `packages/ui/design/DESIGN.md`
  - `packages/ui/src/styles.css`
  - `apps/web/src/App.tsx`
- **Migration** : aucune (préférence par navigateur en `localStorage`, valeur par défaut = système)
- **Critères d'acceptation** (testables) :
  - Tokens sombres déclarés, contrastes AA calculés, `design:check` vert
  - Bascule clair/sombre/système, mémorisée
  - Aucune ombre ni dégradé ; axe sur les deux thèmes
- **Tests à écrire** :
  - Lint design, axe (deux thèmes), capture visuelle
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : aucune
