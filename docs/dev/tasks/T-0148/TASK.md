# T-0148 : fiche, informations justes et actions directes

- **Objectif** : des informations clés exactes, l'action à portée de main quand une valeur manque, et aucune saisie perdue (revue d'ergonomie, O4 ; ADR-0005 § 2.2).
- **Critères d'acceptation** : priorité affichée = champ ; « Non assigné · M'assigner », « + Ajouter » ; « Enregistrement automatique » annoncé ; conflit 409 → saisie conservée et proposée ; marquage export en badge ; e2e fiche vert.
- **Fichiers** : `apps/web/src/components/ItemHeader.tsx`, `pages/ArtifactPage.tsx`, `i18n.ts`, `item-sheet.test.tsx`, `web.test.tsx` ; `e2e/tests/ergonomie.spec.ts`.
