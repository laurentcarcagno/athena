# Infrastructure de développement (temporaire)

Pile locale pour développer Athena. **Jamais en production** : secrets factices, Keycloak en `start-dev`, OpenBao en mode dev (données en mémoire, rescellé à chaque redémarrage). Ports liés à `127.0.0.1`.

| Service | URL / port | Accès (dev) |
|---|---|---|
| PostgreSQL 16 | `127.0.0.1:5432`, base `athena` | utilisateur `athena`, mot de passe dans `.env` |
| Redis 7 | `127.0.0.1:6379` | sans mot de passe |
| MinIO (S3) | API `:9000`, console `:9001` | identifiants dans `.env` |
| Keycloak 26 | http://127.0.0.1:8080 , realm `athena` | admin dans `.env` ; utilisateurs `admin.dev`, `user.dev` (voir `keycloak/athena-realm.json`) |
| OpenBao | http://127.0.0.1:8200 | jeton racine dans `.env` ; KV v2 `secret/`, Transit `athena-org-default`, politique `athena-api` |

## Commandes
```
cp .env.example .env        # une seule fois
docker compose up -d
docker compose ps -a
docker compose down         # arrêt, données conservées
docker compose down -v      # arrêt et effacement des données
```

## Notes
- Le compte `admin.dev` se connecte sans TOTP (environnement de développement). En production, la MFA des administrateurs reste exigée (voir `docs/admin/INSTALLATION.md`).
- Le client `athena-web` est confidentiel avec PKCE S256 (modèle BFF).
- GitLab n'est pas démarré ici : on utilise l'instance interne existante. Un GitLab local ne serait ajouté qu'en cas de besoin de tests isolés (≥ 4 Go de mémoire).
- `.env` est ignoré par Git.

## GitLab local (besoins applicatifs)
- http://127.0.0.1:8929 (SSH `127.0.0.1:2224`), utilisateur `root`, mot de passe `GITLAB_ROOT_PASSWORD` dans `.env`.
- Sert aux tests d'intégration d'Athena (synchronisation d'historique, connecteur de code, webhooks). **Ce n'est pas le dépôt d'Athena** : son `origin` est `ssh://git@gitlab.karka.lan:2222/tools/athena.git`.
- Premier démarrage : 3 à 5 minutes. Le mot de passe doit respecter la politique de GitLab (pas de mots courants).
- Pour que GitLab appelle des webhooks locaux, activer « Autoriser les requêtes vers le réseau local » (Admin > Paramètres > Réseau) dans cette instance de test uniquement.

## Thème de connexion Keycloak

Le dossier `keycloak/themes/athena` (monté dans le conteneur par `docker-compose.yml`) habille la page de connexion aux couleurs de la charte ATHENA ; le realm l'active par `loginTheme`. Sur un Keycloak déjà importé, régler « Thème de connexion » sur `athena` dans la console d'administration (Realm settings > Themes).
