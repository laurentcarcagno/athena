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
- Interface : système de thèmes (ADR-0004, lot 10). Charte : `packages/ui/design/DESIGN.md` et `DESIGN.json`. Hemeria est un thème parmi d'autres (angles droits, aucune ombre, Console Sky = action, rouge = cérémonie). Pour tous les thèmes : aucun dégradé ni verre dépoli, identifiants en IBM Plex Mono, un composant ne lit que des tokens sémantiques ou de composant (jamais une primitive), contrastes WCAG 2.2 AA vérifiés par thème et par mode, casse de phrase (pas de capitales espacées). Moteur et thèmes découplés d'Athena : `@nuance/theming`, `@nuance/themes`.
- Stack : Node 22, TypeScript, NestJS, React, PostgreSQL, Redis, S3/MinIO, Keycloak (identité), OpenBao (secrets).
- Sécurité dès la conception : voir plan § 13. Aucun secret dans le dépôt.

## Infra de développement
`deploy/dev/` : `docker compose up -d` (voir son README). Secrets factices uniquement.

## Taille des tâches
Une tâche tient dans une session (≈ 5 fichiers, ≈ 400 lignes). Plus gros : découper d'abord dans `docs/dev/tasks/`.

## Changement de lot (reprise IHM)
Fin de lot : arrêt et compte rendu. Aucun lot ne s'ouvre tant que les écarts du lot précédent ne sont pas comblés (sauf écart infaisable, accepté explicitement par l'utilisateur). Détail : `docs/dev/STATE.md`.
