# T-0094 : Circuits d'approbation

- **Lot** : 7 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Relecture et approbation nominative horodatée d'un item ou d'une baseline.
- **Fichiers concernés** :
  - `apps/api/src/db/migrations/046_approval_flows.sql`
  - `apps/api/src/core/approval.service.ts`
  - `apps/web/src/components/ApprovalPanel.tsx`
- **Migration** : 046 (la 041 était déjà prise) : `approval_flow`, `approval_step` (RLS forcée), qui étendent la table `approval` de T-0080.
- **Critères d'acceptation** (testables) :
  - Circuit défini sur le tracker ; approbation journalisée dans l'audit chaîné
  - Réutilise l'approbation du rôle AQ étatique (T-0079)
  - Modification après approbation : approbation invalidée avec message
- **Tests à écrire** :
  - API : circuits, invalidation
  - Vitest/RTL
  - axe
- **Règles communes** : interface Hemeria (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0080, T-0091
