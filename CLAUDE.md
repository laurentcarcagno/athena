# CLAUDE.md : Athena

Athena : suivi de projet (trackers configurables, type JIRA + Tuleap), historique dans GitLab, plugins, webhooks. Plan complet : `ATHENA_PLAN_DEVELOPPEMENT.md` (ne pas le relire en entier ; lire la section utile).

## Reprise de session (obligatoire)
1. Lire `docs/dev/STATE.md`, puis `docs/dev/tasks/<tâche en cours>/CONTEXT.md`.
2. `git status` et `git log -5`.
3. Lancer les tests ciblés de la tâche, puis annoncer un plan court.
4. En fin de session (ou vers 70 % du contexte) : état stable, commit, mise à jour de `CONTEXT.md` et `STATE.md`, prompt de reprise.

## Règles de commit (plan § 13.4)
- Auteur et committer uniques : `Laurent Carcagno <laurent.carcagno@gmail.com>`.
- Aucun `Co-Authored-By`, aucune mention d'outil dans les messages ni les descriptions de PR.
- Hooks dans `.githooks/` (activés par `core.hooksPath`). Ne jamais utiliser `--no-verify`.
- Commits conventionnels, un changement logique par commit. Ne pas pousser sans demande.

## Conception
- Interface : Hemeria (`C:\projects\AI\ARIANE\DESIGN.md` et `DESIGN.json`) : angles droits, aucune ombre, aucun dégradé, Console Sky = action, rouge = cérémonie seulement, identifiants en IBM Plex Mono.
- Stack : Node 22, TypeScript, NestJS, React, PostgreSQL, Redis, S3/MinIO, Keycloak (identité), OpenBao (secrets).
- Sécurité dès la conception : voir plan § 13. Aucun secret dans le dépôt.

## Infra de développement
`deploy/dev/` : `docker compose up -d` (voir son README). Secrets factices uniquement.

## Taille des tâches
Une tâche tient dans une session (≈ 5 fichiers, ≈ 400 lignes). Plus gros : découper d'abord dans `docs/dev/tasks/`.
