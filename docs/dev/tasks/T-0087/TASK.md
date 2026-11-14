# T-0087 : Import Tuleap : client REST, structure des trackers, champs, workflows

- **Lot** : 6 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Lire par l'API REST de Tuleap les projets, trackers, champs, statuts, transitions, vers un plan de migration.
- **Fichiers concernés** :
  - `apps/api/src/import/tuleap/client.ts`
  - `apps/api/src/import/tuleap/structure.ts`
  - `apps/api/src/import/tuleap/mapping.ts`
- **Migration** : à déterminer (table de plan/rapport d'import)
- **Critères d'acceptation** (testables) :
  - À préciser après T-0086 : périmètre, jetons, volumes
- **Tests à écrire** :
  - À préciser
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0086
