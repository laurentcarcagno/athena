# T-0086 : Lot 6 : cadrage de la migration (arrêt, questions)

- **Lot** : 6 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Poser les questions ouvertes avant tout code : projets Tuleap à migrer en premier, historique Jira repris ou archivé en lecture. Écrire ensuite les fiches de détail.
- **Fichiers concernés** :
  - `docs/dev/tasks/T-0087 à T-0090`  (à compléter)
  - `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`  (réponses)
- **Migration** : à déterminer
- **Critères d'acceptation** (testables) :
  - Réponses du demandeur consignées dans l'ADR
  - Les fiches T-0087 à T-0090 sont complétées et validées
- **Tests à écrire** :
  - Aucun
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : fin du Lot 7 (décision du 2026-11-06 : les imports se traitent en toute fin de projet)
