# Installation et exploitation d'Athena

## Composants
| Composant | Rôle | Image / commande |
|---|---|---|
| `api` | API REST, authentification web (BFF), sessions | `athena-api` : `dist/main.js` |
| `worker` | Historique GitLab, webhooks sortants, automatisations, hooks de plugins, purge des sessions | même image : `dist/worker.js` (**une seule instance**) |
| `web` | Application web (nginx, CSP stricte) | `athena-web` |
| migrations | Schéma PostgreSQL | même image : `dist/migrate-cli.js` |

Dépendances externes : PostgreSQL 16, Keycloak (un realm), OpenBao, GitLab, (S3/MinIO réservé aux pièces jointes, non encore utilisé).

## Développement local
```
cp deploy/dev/.env.example deploy/dev/.env        # secrets factices
docker compose -f deploy/dev/docker-compose.yml up -d
pnpm install && pnpm check
```
`deploy/dev/README.md` décrit la pile (PostgreSQL, Redis, MinIO, Keycloak, OpenBao, GitLab local).

## Construction des images
```
docker build -f deploy/docker/Dockerfile --target api -t athena-api:0.1.0 .
docker build -f deploy/docker/Dockerfile --target web -t athena-web:0.1.0 .
```
Les conteneurs s'exécutent en non-root, système de fichiers en lecture seule, sans capacités (vérifié).

## Déploiement Kubernetes
```
helm upgrade --install athena deploy/helm/athena -f mes-valeurs.yaml
```
Prérequis : deux secrets Kubernetes, alimentés par OpenBao (jamais dans le dépôt).
- `athena-env` : `DATABASE_URL` (compte **applicatif**, soumis à la RLS), `KEYCLOAK_WEB_CLIENT_SECRET`, `OPENBAO_TOKEN`, `GITLAB_TOKEN`, `PLUGIN_TRUSTED_KEYS` (JSON éditeur → clé publique Ed25519).
- `athena-migration` : `MIGRATION_DATABASE_URL` (compte **propriétaire du schéma**). L'application ne peut jamais modifier le schéma.

Le job de migration s'exécute avant chaque installation ou mise à jour (hook Helm).

## Keycloak
Realm avec : client confidentiel `athena-web` (PKCE S256, URI de redirection `https://<hôte>/auth/callback`, URL de déconnexion back-channel `https://<hôte>/auth/backchannel-logout`), mappeurs d'audience `athena-api` et de groupes (`groups`, chemins complets), rôles `athena-user` et `athena-admin`. Chaque organisation est un groupe `/org-<clé>`. Activer la MFA (TOTP/WebAuthn) pour les administrateurs. Un exemple complet est dans `deploy/dev/keycloak/athena-realm.json` (**ne pas l'utiliser tel quel en production** : mots de passe de démonstration).

## OpenBao
- KV v2 : `secret/athena/<organisation>/…` (secrets de webhooks, intégrations), `secret/athena/platform/session` (secret de session, généré au premier démarrage).
- Transit : une clé dérivée par organisation (`athena-org-<clé>`), créée à la demande.
- Politique minimale : voir `deploy/dev/openbao/athena-api.hcl`.
- Authentification des services : méthode Kubernetes ; ne pas utiliser de jeton racine.

## GitLab
- Un dépôt d'historique par projet Athena, dans le groupe `GITLAB_NAMESPACE` (créé automatiquement). Le jeton doit pouvoir créer des dépôts, des commits, des tags.
- **Signature des commits** : les commits d'historique sont créés par l'API GitLab sous l'identité de l'auteur réel. Pour qu'ils soient signés, activer la signature des commits web de l'instance GitLab (paramètre d'administration, GitLab ≥ 16.3). La signature par utilisateur n'est pas implémentée.
- **Mode « merge request obligatoire »** : protéger `main` des dépôts d'historique (« Fusion par MR uniquement », autoriser le compte de service d'Athena à pousser). Les fusions arrivent par le webhook `push` (`/hooks/in/history/<org>/<projet>`) et sont importées avec les contrôles d'auteur, de validation et de conflit.
- Webhooks entrants : `POST /v1/projects/<P>/integrations/gitlab` (dépôts de code) et `/integrations/history` (dépôt d'historique) retournent l'URL et le secret (affiché une seule fois).

## Variables d'environnement principales
`DATABASE_URL`, `KEYCLOAK_ISSUER`, `KEYCLOAK_WEB_CLIENT_ID/SECRET`, `PUBLIC_URL`, `WEB_ORIGIN`, `COOKIE_SECURE`, `OPENBAO_ADDR/TOKEN`, `GITLAB_URL/TOKEN/NAMESPACE`, `PLUGIN_TRUSTED_KEYS`, `RATE_LIMIT_API_PER_MINUTE`, `RATE_LIMIT_SENSITIVE_PER_MINUTE`, `TRUST_PROXY`, `WEBHOOK_ALLOW_PRIVATE` (**faux en production**). Le worker ajoute `HISTORY_INTERVAL_MS`, `WEBHOOKS_INTERVAL_MS`, `SESSIONS_INTERVAL_MS`, `WORKER_HEALTH_PORT`.

## Exploitation
- Santé : `GET /healthz` (api), `GET :3002/healthz` (worker : 503 si une boucle échoue en continu).
- Reconstruction après sinistre : créer l'organisation et le projet vides, puis `POST /v1/projects/<P>/rebuild` (administrateur) ; l'historique des révisions reste dans Git.
- Sauvegardes : PostgreSQL (RPO visé 15 min) ; les dépôts GitLab d'historique sont la seconde source de vérité.
- Un seul worker : ne jamais augmenter ses réplicas.

## Limites connues
Voir `docs/security/REVUE.md` (test d'intrusion externe à commander, limiteur de débit par instance) et `docs/dev/STATE.md`.

## Pièces jointes : stockage et antivirus

Variables : `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`. Antivirus optionnel : `CLAMAV_HOST` et `CLAMAV_PORT` (clamd, commande INSTREAM). Quand il est configuré, un fichier détecté est refusé, et l'indisponibilité de clamd refuse aussi le fichier (échec fermé).

## Report des références dans les .sdoc

`POST /v1/projects/:p/docs/:source/writeback` {repo, ref} crée une branche `athena/doc-refs/*` et une merge request qui ajoutent le champ `ATHENA_REFS` aux exigences liées. Le champ doit être déclaré dans la grammaire du document (`[GRAMMAR]`). Jamais d écriture directe.

## Recette Kubernetes locale (kind)

Un déploiement réel du chart a été réalisé le 2026-10-31 sur un cluster `kind` (Kubernetes 1.32) : PostgreSQL 16 en pod, images `athena-api` et `athena-web` chargées avec `kind load docker-image`, rendu du chart avec `helm template` puis `kubectl apply`.

Séquence : secrets `athena-migration` (compte propriétaire) et `athena-env` → job de migration (21 migrations appliquées) → création du rôle de connexion applicatif membre de `athena_app` (`create role … in role athena_app`, sans `bypassrls`) → API, worker et web démarrent. Vérifié : le web relaie `/v1` et `/auth` vers l'API (401 sans jeton, `{"authenticated":false}`), en-têtes de sécurité présents.

Constats corrigés ou à connaître :
- nginx résout le service API sans liste de recherche DNS : l'amont est maintenant le nom complet `athena-api.<espace>.svc.<clusterDomain>` (valeur `clusterDomain`, défaut `cluster.local`).
- Le worker refuse de démarrer en production sans `OPENBAO_ADDR` et `OPENBAO_TOKEN` (garde-fou voulu).
- Les politiques réseau n'ont pas été éprouvées : `kind` n'applique pas NetworkPolicy sans CNI dédié (Calico/Cilium).
- Non couvert : ingress TLS, Keycloak dans le cluster, réplicas multiples sous charge, sauvegarde/restauration.
