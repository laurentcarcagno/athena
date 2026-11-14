# T-0085 : Baselines couplées aux versions des documents

- **Lot** : 5 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Afficher et comparer les `doc_shas` d'une baseline, bloquer l'écart silencieux.
- **Fichiers concernés** :
  - `apps/api/src/history/baseline.service.ts`
  - `apps/web/src/pages/project/PlanningTab.tsx`
  - `apps/web/src/components/BaselineCompare.tsx`
- **Migration** : aucune
- **Critères d'acceptation** (testables) :
  - Une baseline enregistre le SHA de chaque source documentaire
  - La comparaison de deux baselines liste les exigences ajoutées, modifiées, supprimées
  - Exportable (marquage de protection si défini)
- **Tests à écrire** :
  - API : baseline avec documents, comparaison
  - Vitest/RTL
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0081
