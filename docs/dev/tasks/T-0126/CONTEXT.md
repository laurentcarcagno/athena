# Journal de la tâche T-0126

## Fait
- 2026-11-10 : lot 10 ouvert par l'utilisateur (« J'accepte le report de l'écart 4, commence T-0126 »).
- `docs/dev/DECISIONS/ADR-0004-themes.md` (décisions du demandeur, architecture en trois couches, axes thème / mode / densité, ce qu'un thème peut changer) et `docs/dev/tasks/LOT10-PLAN.md` (T-0126 à T-0141).
- `DESIGN.md` : note d'évolution au § 1, décision D-019 au journal ; `DESIGN.json` : D-019, version 3.2.0. `validate-design --strict` et `lint-design` OK ; `@athena/ui` 52 tests sur 52.
- `CLAUDE.md` : section Conception réécrite (Athena est un thème ; règles communes à tous les thèmes ; paquets `@nuance/*`).
- Non-régression visuelle : `e2e/tests/visuel.spec.ts` (12 écrans × clair et sombre × 375, 768, 1024, 1440 px = 96 captures), scripts `pnpm visuel` et `pnpm visuel:reference` dans `e2e/package.json`, `snapshotPathTemplate` vers `e2e/visuel/reference/` (ignoré par Git). Références prises, puis seconde passe : **96 sur 96 identiques** (2,8 min).

## Reste à faire
- Rien pour T-0126. Suivante : T-0127 (`packages/theming`, `@nuance/theming`).

## Décisions et pièges
- **Toujours lancer les captures par `pnpm visuel`** (depuis `e2e/`) : le script reconstruit l'API, réinitialise la base e2e et retire le TOTP de `admin.dev` (`global-setup.mjs`). Sans cela, `global-teardown.mjs` a remis le TOTP et la connexion bloque ; le test échoue désormais en 30 s avec un message.
- Après un arrêt brutal des e2e, des processus restent sur 3000 (Vite) et 3001 (API) : les arrêter avant de relancer (Playwright refuse les ports occupés).
- La spécification n'est active que si la ligne de commande contient « visuel » (`playwright.config.ts` pose `VISUEL=1`) : la suite e2e ordinaire l'ignore.
- Les références dépendent des données de `global-setup.mjs` (projet ARI, tracker BUG, un ticket) et de l'ordre des visites (compteur Récents) : ne pas modifier ces données pendant les tâches de plomberie T-0127 à T-0131, ou reprendre les références (`pnpm visuel:reference`) **avant** la tâche.
- Les références sont locales (pas dans Git) : sur une autre machine, les reprendre depuis le commit de T-0126 avant toute modification.
- Défauts existants vus sur les références, hors périmètre, à traiter dans le lot (T-0134) :
  - à 375 px, l'écran Tracker déborde horizontalement (bouton « Configurer » des actions du `PageHeader`) ;
  - à 1024 et 1440 px, le pied du rail (avatar et 6 boutons-icônes) est rogné à droite dans 232 px ;
  - « Nouvel item » et « 1 item » restent dans l'écran Tracker alors que le glossaire de l'ADR-0003 impose « Ticket » (le test de vocabulaire ne cherche que « artefact », « release » et « template »).

## Commandes utiles
```
cd deploy/dev && docker compose up -d postgres redis minio keycloak openbao
cd e2e && pnpm visuel              # comparaison avec la référence
cd e2e && pnpm visuel:reference    # nouvelle référence (avant une tâche visible)
pnpm --filter @athena/ui test && pnpm --filter @athena/ui lint
```

## Prompt de reprise
Lot 10 (thèmes), ADR-0004. T-0126 faite. Reprendre par T-0127 : créer `packages/theming` (`@nuance/theming`) : schéma DTCG, résolution des alias, des modes et de l'héritage, contrôle des contrastes, générateur CSS, CLI `build` et `check`, sans aucune dépendance à `@athena/*`. Lire `docs/dev/tasks/LOT10-PLAN.md` et ADR-0004 § 3. Aucun changement visible : `cd e2e && pnpm visuel` doit rester à 96 sur 96.
