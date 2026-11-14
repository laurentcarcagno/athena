# T-0093 : Mentions

- **Lot** : 7 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Mentions `@utilisateur` dans les commentaires, avec autocomplétion et notification.
- **Fichiers concernés** :
  - `apps/api/src/core/link.service.ts`  (commentaires)
  - `apps/web/src/components/MentionInput.tsx`
- **Migration** : aucune
- **Critères d'acceptation** (testables) :
  - Mention restreinte aux utilisateurs ayant accès à l'item
  - Notification et entrée dans « Mon travail »
  - Rendu assaini
- **Tests à écrire** :
  - API + Vitest/RTL
  - axe
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0091
