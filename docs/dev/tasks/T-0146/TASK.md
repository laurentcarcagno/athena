# T-0146 : créer un ticket sans hésiter

- **Objectif** : boutons nommés, moins de champs d'emblée, « Moi » pour le responsable (revue d'ergonomie, O1 ; ADR-0005 § 2.2).
- **Critères d'acceptation** : « Annuler » et « Créer le ticket » ; obligatoires et description d'abord, « Plus de champs (n) » ; Responsable avec « Moi » ; exemple de titre ; rappel Entrée / Échap ; tests web ; e2e création vert.
- **Fichiers** : `apps/web/src/components/CreateArtifact.tsx`, `api.ts` (`currentUser`), `i18n.ts`, `create-dialog.test.tsx`, tests mis à jour ; `packages/ui/src/styles/views.css` ; `e2e/tests/creation.spec.ts`.
