# Journal de la tâche T-0051

## Fait
- `serializeArtifact` écrit `aliases` (si présents) ; `history-sync` écrit toujours au chemin de la clé courante (`current_key`), même pour un événement antérieur à la migration, avec message de commit à la clé courante.
- `RebuildService.migrateKeys` : un commit par projet qui renomme `REQ-42.yaml` en `SAT1-REQ-0042.yaml` (clé et alias dans le YAML), supprime l'ancien fichier si le canonique existe déjà, aucun commit s'il n'y a rien à faire. Exposé par `POST /v1/projects/:project/history/migrate-keys` (administrateur).
- `rebuild` d'un dépôt ancien format ou d'un autre projet : clé canonique recalculée, ancienne clé conservée en alias, alias du YAML repris.
- Les regex de chemins (`rebuild`, `baseline`, `reverse-sync`) acceptent les deux formats (déjà fait avec T-0049).
- Tests : `reverse-rebuild.test.ts` (dépôt ancien format, migration, idempotence, mise à jour par ancienne clé, reconstruction).

## Reste à faire
- Appeler `migrate-keys` sur chaque projet existant après le déploiement de la migration 030 : à documenter dans `docs/admin/INSTALLATION.md` (T-0052).
- Une clé canonique venant d'un autre projet n'est pas conservée en alias (la contrainte n'autorise que l'ancien format) : la clé est recalculée sur le projet cible.

## Décisions et pièges
- La migration des fichiers n'est pas automatique (listing complet du dépôt à chaque cycle jugé trop coûteux) : route d'administration idempotente.
- Les anciens commits ne sont pas réécrits.

## Commandes utiles
- `cd apps/api && npx vitest run src/history/reverse-rebuild.test.ts` (Postgres et GitLab de `deploy/dev`).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0052 (interface, redirections, e2e, documentation).
