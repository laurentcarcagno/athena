# T-0154 : organiser sa vue

- **Objectif** : chacun organise ses tableaux de bord : déplacer, élargir, ajouter, masquer, revenir au défaut (revue, second tour, principe 2 ; ADR-0005 § 2.3).
- **Critères d'acceptation** : glisser-déposer et clavier, largeur S / M / L / XL, « + Ajouter une carte », disposition enregistrée par page, retour au défaut ; tests web (souris et clavier) ; e2e : déplacer et redimensionner, retrouvé au rechargement.
- **Fichiers** : `apps/web/src/components/Dashboard.tsx`, `components/Dashboard.test.tsx`, `dashboard-cards.test.tsx`, `i18n.ts` ; `packages/ui/src/styles/containers.css` ; `e2e/tests/{tableau-de-bord,ergonomie}.spec.ts`.
