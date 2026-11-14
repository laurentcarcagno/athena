# T-0096 : Constats restants de l'audit d'interface

- **Lot** : 7 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Traiter les constats non résolus après le commit ee3b0a2 (vérifier F-08 à F-13 contre le code) et rejouer l'audit.
- **Fichiers concernés** :
  - `design-audit-work/AUDIT_athena.md`  (mise à jour)
  - `apps/web/src/pages/AdminPage.tsx`  (F-13)
  - `apps/web/src/*`
- **Migration** : aucune
- **Critères d'acceptation** (testables) :
  - Chaque constat est marqué corrigé (avec preuve) ou ouvert (avec raison)
  - Nouvelle mesure axe sur toutes les pages
  - Décision produit consignée pour F-11 (raccourci `Ctrl+K`)
- **Tests à écrire** :
  - Playwright + axe
  - Mesures de l'audit rejouées
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : Lots 0 à 5 et T-0091 à T-0095 (le Lot 6 vient après)
