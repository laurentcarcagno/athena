# Lot 16 : rôles manager et directeur, équipes et portefeuilles

Décisions : `docs/dev/DECISIONS/ADR-0008-roles-equipes-portefeuilles.md`. Ouvert par l'utilisateur le 2026-11-14 (commande `/goal`, sans question).

| Tâche | Contenu | État |
|---|---|---|
| T-0179 | Renommer `athena-user` en `athena-team-member` (code, tests, realm, docs) ; rôles `athena-manager` et `athena-director` dans la garde (alias de l'ancien nom, directeur en lecture seule) ; comptes de développement `manager.dev` et `director.dev` | faite |
| T-0180 | Migration 063 : `team`, `team_member`, `portfolio`, `portfolio_project` (RLS par organisation) | faite |
| T-0181 | API équipes et charge : `/v1/teams`, `/v1/teams/:clé/load` ; manager limité à ses équipes | faite |
| T-0182 | API portefeuilles : `/v1/portfolios`, `/summary`, `/:clé`, projets, santé forcée, note | faite |
| T-0183 | Interface : pages Charge des équipes et Portefeuilles, rail, rôle affiché, catalogue du directeur | faite |
| T-0184 | Documentation (guide, installation, ADR-0008), `STATE.md`, vérification | faite |
