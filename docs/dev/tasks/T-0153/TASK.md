# T-0153 : modèle de carte commun et grille

- **Objectif** : un seul modèle de carte et une grille à largeurs fixes pour les tableaux de bord (revue, second tour, principe 1 ; O3 ; ADR-0005 § 2.3).
- **Critères d'acceptation** : `DashCard` (en-tête, corps, pied) et grille de 12 colonnes S / M / L / XL à hauteur commune ; migration 057 (portée Avancement) et largeur par carte ; Mon travail : cartes vides résumées, « Me l'assigner » ; Vue d'ensemble migrée ; tests UI, API et web ; e2e verts.
- **Fichiers** : `packages/ui/src/components.tsx` (`DashCard`, `DashGrid`), `styles/containers.css` ; `packages/themes/base/theme.json` (`size.dashcard`) ; `apps/api/src/db/migrations/057_dashboard_cards.sql`, `core/dashboard.{service,controller,test}.ts` ; `apps/web/src/components/Dashboard.tsx`, `pages/MyWorkPage.tsx`, `i18n.ts`, `dashboard-cards.test.tsx`.
