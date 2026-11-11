# T-0144 : droits manquants

- **Objectif** : plus de page sans issue quand un droit manque (revue d'ergonomie, B5 ; ADR-0005 § 2.1).
- **Critères d'acceptation** : composant « Accès réservé » (ce qui manque, qui peut agir, comment demander, retour) ; entrées masquées selon le rôle ; section ou rapport non autorisé = message, plus de bascule silencieuse ; tests web par rôle ; e2e chef de projet.
- **Fichiers** : `apps/web/src/components/AccessNotice.tsx`, `pages/{SettingsPage,ReportsPage,TrackerCreatePage,OrgAdminPage}.tsx`, `i18n.ts` (`denied`), `access-notice.test.tsx`, tests mis à jour ; `e2e/tests/ergonomie.spec.ts`.
