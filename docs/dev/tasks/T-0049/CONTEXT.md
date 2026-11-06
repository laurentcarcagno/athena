# Journal de la tâche T-0049

## Fait
- Migration 030 : `artifact_key_alias`, réécriture des clés, unicité par organisation, contrainte de format, `resolve_artifact`, trigger d'immutabilité de la clé de projet.
- `core/key.ts` : format, analyse, motifs partagés. Génération dans `artifact.service.ts` et `import.service.ts`.
- Résolution des alias dans `artifact.service`, `link.service`, contrôleur ; événements, audit et liens portent la clé canonique.
- Tests : `core/keys.test.ts` (migration sur base ancienne, alias par projet, > 9999, RLS, immutabilité, ATQL).
## Reste à faire
- Historique GitLab (chemins déjà corrects pour les nouveaux artefacts ; reste migration des fichiers et alias dans le YAML) : T-0051.
- Interface : T-0052.
## Décisions et pièges
- T-0049, T-0050 et T-0098 ont été exécutées et livrées dans un seul commit : les services, les tests qui codent des clés en dur et l'extraction de clés dans les textes ne pouvaient pas rester verts séparément.
- Les tests ont été convertis au nouveau format (`ARI-BUG-0001`) ; les anciennes clés ne sont des alias que pour les artefacts présents à la migration.
- `history.test.ts` « mode merge request » est intermittent en série complète (échouait déjà avant ces changements) ; il passe seul.
- Dans un gabarit de chaîne JavaScript, `\d` et `\b` doivent être doublés : l'outil shell a déjà supprimé des barres ; utiliser l'outil d'édition pour les regex.
- e2e non rejoué : les ports 3000/3001 sont occupés par le serveur de développement de l'utilisateur (ne pas l'arrêter).
## Commandes utiles
- Pile de développement : `deploy/dev` (`docker compose up -d`), `deploy/dev/.env` copié de `.env.example`, `GITLAB_DEV_TOKEN` créé par `docker exec athena-dev-gitlab-1 gitlab-rails runner` (jeton personnel de `root`).
- `pnpm --filter @athena/api test` (Postgres et GitLab réels), `pnpm exec turbo run lint typecheck test --force --filter='!@athena/e2e'`.
## Prompt de reprise
Lire `docs/dev/STATE.md` (section Reprise IHM), cette fiche, puis enchaîner sur la tâche suivante de la liste.
