# T-0003 : squelette API et authentification Keycloak (phase 1)
- Objectif : API NestJS/Fastify, config validée, garde globale JWT (signature, émetteur, audience, expiration), rôles, en-têtes de sécurité.
- Critères : 13 tests verts ; vérifié contre le Keycloak de dev (401 sans jeton, 200 avec jeton, 403 pour un non-admin).
- Statut : terminé. Suite : persistance (T-0004), BFF et sessions, OpenBao.
- Note : le client `athena-dev-cli` (mot de passe direct) n'existe que dans le realm de dev.
