# T-0135 : densité

- **Objectif** : densités Normale et Compacte au choix de l'utilisateur, cibles de 44 px sur écran tactile, espacements sur l'échelle.
- **Critères d'acceptation** : Compacte à 28 px de contrôle, jamais sous 12 px de texte ni sous 24 px de cible (test) ; 44 px en `pointer: coarse` ; préférence sur le compte (migration 053) appliquée sur un navigateur neuf ; réglage dans Profil ; mesure e2e.
- **Fichiers** : `apps/api/src/db/migrations/053_user_density.sql`, `core/preference.service.ts` et test ; `apps/web/src/lib/theme.ts`, `lib/preferences.tsx`, `pages/ProfilePage.tsx`, `i18n.ts`, tests ; `packages/ui/src/styles/density.css` (+ `styles.css`), espacements des parties, `density.test.ts`, `themes.test.ts` ; `e2e/tests/controles.spec.ts`.
