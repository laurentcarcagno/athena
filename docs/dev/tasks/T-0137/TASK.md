# T-0137 : icône de marque par thème

- **Objectif** : chaque thème a une icône de marque (rail, favicon) ; l'organisation peut la remplacer, par thème ou pour tous les thèmes ; téléversement sûr.
- **Critères d'acceptation** : SVG avec `<script>` ou lien externe refusé ou nettoyé (tests) ; image servie avec type strict, `nosniff` et `Content-Security-Policy: sandbox`, affichée par `<img>` uniquement ; e2e de remplacement d'icône ; favicon qui suit le thème.
- **Fichiers** : `apps/api` (migration 055, `brand-image.ts`, `brand.service.ts`, `brand.controller.ts`, `core.module.ts`, `security/hardening.ts` et tests) ; `packages/themes` (`base/mark.svg`, `hemeria/mark.svg`) ; `packages/ui` (`build-themes.mjs` : icône par défaut dans le catalogue, `Sidebar` : marque, styles) ; `apps/web` (`lib/brand.ts`, `App.tsx`, `components/Appearance.tsx`, `api.ts`, `i18n.ts`, `brand.test.tsx`) ; `e2e/tests/themes.spec.ts`.
