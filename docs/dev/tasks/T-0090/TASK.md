# T-0090 : Archives Jira 7.1.6 (API REST v2 ou export XML)

- **Lot** : 6 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Reprendre ou archiver en lecture les données Jira 7.1.6 selon la décision du demandeur.
- **Fichiers concernés** :
  - `apps/api/src/import/jira/*`
- **Migration** : à déterminer
- **Critères d'acceptation** (testables) :
  - À préciser après T-0086
- **Tests à écrire** :
  - À préciser
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0086
