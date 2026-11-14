# T-0083 : Exigence documentaire : artefacts citants

- **Lot** : 5 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Sur chaque exigence affichée, lister les artefacts Athena qui la citent (et leur état).
- **Fichiers concernés** :
  - `apps/api/src/docs/doc-link.service.ts`
  - `apps/api/src/docs/doc.controller.ts`
  - `apps/web/src/components/DocNodeView.tsx`
- **Migration** : aucune
- **Critères d'acceptation** (testables) :
  - `GET .../docs/nodes/:uid/citations` renvoie artefacts, état, lien suspect
  - Visible dans la liste et dans le panneau de l'exigence
  - Respecte les droits et les listes d'ayants droit
- **Tests à écrire** :
  - API : citations, droits
  - Vitest/RTL
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0081, T-0082
