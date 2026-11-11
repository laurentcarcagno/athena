# T-0151 : Membres et Administration > Projets

- **Objectif** : ajouter un membre sans hésiter, ranger les réglages rares ; une liste de projets plutôt qu'une pile de formulaires (revue d'ergonomie, O9 et O10 ; ADR-0005 § 2.2).
- **Critères d'acceptation** : « Ajouter au projet », « Retirer… » avec confirmation, accès restreint et contrôle export repliés ; tableau des projets et « Nouveau projet » ; tests web ; e2e membres et administration verts.
- **Fichiers** : `apps/web/src/pages/ProjectManagePage.tsx` (`ActorsTab`), `pages/project/MembersTab.tsx`, `pages/OrgAdminPage.tsx` (`ProjectsTab`), `components/AccessLists.tsx`, `i18n.ts`, tests ; `packages/ui/src/styles/views.css` ; `e2e/tests/{gabarits,parcours}.spec.ts`.
