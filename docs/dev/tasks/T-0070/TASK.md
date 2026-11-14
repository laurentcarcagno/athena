# T-0070 : Héritage de gabarits

- **Lot** : 3 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Socle d'organisation → gabarit normatif → dérivé ; un enfant ajoute, ne retire jamais un élément obligatoire du parent.
- **Fichiers concernés** :
  - `apps/api/src/core/template-inherit.ts`
  - `apps/api/src/core/template.service.ts`
  - `apps/api/src/core/template.test.ts`
- **Migration** : aucune
- **Critères d'acceptation** (testables) :
  - Résolution d'un gabarit = fusion parent + enfant, déterministe
  - Tentative de retirer/renommer un élément obligatoire : refusée avec la liste des éléments
  - Cycles d'héritage refusés ; profondeur limitée (5)
- **Tests à écrire** :
  - Vitest : table de fusion, retrait interdit, cycles
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0069
