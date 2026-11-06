# T-0089 : Import Tuleap : documents Artidoc et interface d'import avec rapport

- **Lot** : 6 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Importer les Artidoc (vers StrictDoc ou lecture seule, à trancher) et offrir l'import depuis l'interface avec rapport.
- **Fichiers concernés** :
  - `apps/api/src/import/tuleap/artidoc.ts`
  - `apps/web/src/pages/project/ImportPage.tsx`
- **Migration** : à déterminer
- **Critères d'acceptation** (testables) :
  - À préciser après T-0086
- **Tests à écrire** :
  - À préciser
- **Règles communes** : interface Hemeria (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0088
