# T-0147 : une seule barre de filtres dans le tracker

- **Objectif** : vues au-dessus, une barre de filtres lisible, et la liste visible d'emblée sur téléphone (revue d'ergonomie, O2 et O12 ; ADR-0005 § 2.2).
- **Critères d'acceptation** : aucun bouton sans texte dans la barre ; recherche lancée par Entrée ; vue enregistrée, colonnes et requête avancée dans la barre ; à 390 px le tableau commence dans le premier écran, « Filtres » déplie le reste ; e2e verts.
- **Fichiers** : `apps/web/src/components/FilterBar.tsx`, `SavedViews.tsx`, `pages/tracker/TrackerScreen.tsx`, `i18n.ts`, `web10.test.tsx` ; `packages/ui/src/styles/{views,mobile-charts,controls}.css` ; `e2e/tests/{ergonomie,controles}.spec.ts`.
