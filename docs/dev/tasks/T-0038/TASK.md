# T-0038 : tests de bout en bout

- `e2e/` (Playwright, Chromium) : `pnpm --filter @athena/e2e test`. Prérequis : infra dev (Postgres, Keycloak), `pnpm --filter @athena/api build`, `pnpm exec playwright install chromium`.
- `global-setup.mjs` crée la base `athena_e2e` (migrée, RLS, org demo, projet ARI/BUG) ; l API et Vite sont lancés par `playwright.config.ts`.
- Parcours : connexion Keycloak réelle (user.dev), liste, fiche, transition ; redirection si non authentifié ; audit axe-core contraste compris.
- Défauts réels corrigés : contraste du texte secondaire et des pastilles, groupe ARIA sans rôle, lien non souligné dans le texte.
- Reste : Storybook ; parcours admin (TOTP requis pour admin.dev).

- Parcours administrateur ajouté (TOTP de admin.dev retiré par global-setup via l API Keycloak). `pnpm test` reconstruit l API avant.
