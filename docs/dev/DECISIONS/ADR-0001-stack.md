# ADR-0001 : Stack et identité

Statut : accepté (2026-10-31). Voir `ATHENA_PLAN_DEVELOPPEMENT.md` § 23.1.

- Backend Node 22 + NestJS + TypeScript ; front React ; PostgreSQL ; Redis ; MinIO.
- Keycloak : realm unique, groupes par organisation. OpenBao pour secrets et chiffrement.
- Historique : un dépôt GitLab par projet, signature de service, auteur = utilisateur réel.
