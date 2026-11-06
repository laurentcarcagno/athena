# T-0088 : Import Tuleap : artefacts, liens, commentaires, pièces jointes, historique

- **Lot** : 6 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Importer le contenu avec conservation des liens et de l'historique.
- **Fichiers concernés** :
  - `apps/api/src/import/tuleap/artifacts.ts`
  - `apps/api/src/import/import.service.ts`
- **Migration** : à déterminer
- **Critères d'acceptation** (testables) :
  - À préciser après T-0086 : critère « trois projets migrés sans perte de liens »
- **Tests à écrire** :
  - À préciser
- **Règles communes** : interface Hemeria (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0087
