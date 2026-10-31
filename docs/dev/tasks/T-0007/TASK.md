# T-0007 : historique des trackers dans GitLab (phase 3)
- Objectif : un commit par modification d'artefact dans un dépôt GitLab par projet ; auteur = utilisateur réel ; committer = compte de service ; trailers Athena-* ; SHA stocké dans la révision.
- Livré : sérialisation YAML déterministe, client GitLab v4, worker outbox idempotent et ordonné, reprise après panne, profils utilisateurs (`user_account`) alimentés à la connexion, point d'entrée `start:worker`.
- Tests : 6 (dont intégration contre le GitLab local : auteurs, trailers, SHA, idempotence, panne/reprise). Ignorés si PostgreSQL ou GitLab local indisponibles (jeton `GITLAB_DEV_TOKEN` dans `deploy/dev/.env`).
- Non fait : tracker.yaml (définition des trackers), signature de commits, synchronisation inverse GitLab→Athena, restauration, baselines (tags), regroupement de commits, chiffrement des champs confidentiels (OpenBao Transit), gitleaks avant commit.
