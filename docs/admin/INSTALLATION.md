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
Realm avec : client confidentiel `athena-web` (PKCE S256, URI de redirection `https://<hôte>/auth/callback`, URL de déconnexion back-channel `https://<hôte>/auth/backchannel-logout`), mappeurs d'audience `athena-api` et de groupes (`groups`, chemins complets), rôles `athena-user`, `athena-pm` (chef de projet) et `athena-admin`. Un chef de projet reçoit `athena-user` et `athena-pm`, puis est désigné chef de chaque projet par un administrateur (fenêtre **Organisation**). Chaque organisation est un groupe `/org-<clé>`. Activer la MFA (TOTP/WebAuthn) pour les administrateurs. Un exemple complet est dans `deploy/dev/keycloak/athena-realm.json` (**ne pas l'utiliser tel quel en production** : mots de passe de démonstration).

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

## Réseau isolé

Une instance destinée à un réseau sans accès Internet (par exemple l'instance Défense) se déploie sans aucune dépendance extérieure : images et chart transférés par un support autorisé, polices embarquées, Keycloak et OpenBao dans le cluster, politiques réseau « tout refuser ».

### 1. Préparer le lot (poste connecté)
```
docker build -f deploy/docker/Dockerfile --target api -t athena-api:0.1.0 .
docker build -f deploy/docker/Dockerfile --target web -t athena-web:0.1.0 .
node tools/check-external-urls.mjs --dist          # aucune URL externe dans le code, les feuilles de style, le HTML, les images
node tools/export-bundle.mjs --out dist-bundle --version 0.1.0
node tools/export-bundle.mjs --verify dist-bundle  # sommes de contrôle
tar -cf athena-isolated-0.1.0.tar dist-bundle
```
Le lot contient `images/*.tar` (Athena, PostgreSQL, Keycloak, OpenBao), `chart/athena-<version>.tgz`, `values-isolated.yaml`, `load-bundle.sh`, `manifest.json` et `SHA256SUMS`. Figer les versions des images tierces avant l'export (`--images`). Les dépendances applicatives sont dans les images : rien n'est téléchargé à l'installation.

### 2. Charger dans le registre interne (réseau isolé)
```
tar -xf athena-isolated-0.1.0.tar && cd dist-bundle
REGISTRY=registre.interne.lan/athena sh load-bundle.sh      # vérifie SHA256SUMS, charge, étiquette et pousse
```

### 3. Isoler le DNS du cluster
Avec le `forward` par défaut de CoreDNS, un pod isolé résout encore les noms publics (canal de sortie par le DNS ; constaté sur `kind`). Appliquer une fois par cluster `coredns-isolated.yaml` (livré dans le lot) puis redémarrer CoreDNS : les noms du cluster se résolvent, les noms externes échouent (`EAI_AGAIN`). Pour des noms internes hors cluster, ajouter un bloc `forward <domaine interne> <serveur DNS interne>` limité à ce domaine.

### 4. Installer
Créer les secrets (jamais dans le dépôt) : `athena-env`, `athena-migration`, `athena-keycloak` (`KC_DB_URL`, `KC_DB_USERNAME`, `KC_DB_PASSWORD`, `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`) et `athena-openbao-tls` (certificat émis par l'autorité interne). Puis :
```
helm upgrade --install athena chart/athena-0.1.0.tgz -f values-isolated.yaml -f mes-valeurs.yaml --set image.registry=$REGISTRY
```
Keycloak : l'image standard se construit au démarrage et exige un système de fichiers inscriptible ; pour le garder en lecture seule, construire une image optimisée (`kc.sh build`) avant transfert et régler `isolated.keycloak.optimizedImage: true`. OpenBao tourne sous l'uid 100 (gid 1000) : le chart les fixe.

`values-isolated.yaml` active `isolated.enabled` : le chart crée Keycloak (importe le royaume depuis la ConfigMap `isolated.keycloak.realmConfigMap`) et OpenBao (stockage fichier, TLS interne), et remplace les politiques réseau par des politiques sans sortie HTTPS générique. L'API et le worker ne joignent que PostgreSQL (`networkPolicy.databaseCidr`), Keycloak, OpenBao et les hôtes listés dans `networkPolicy.internalCidrs`.

### 5. Initialiser OpenBao
Initialiser et desceller OpenBao (`bao operator init`, clés de descellement réparties entre plusieurs personnes), activer le moteur `secret`, charger la politique `deploy/dev/openbao/athena-api.hcl`, puis placer le jeton applicatif dans `athena-env` (`OPENBAO_TOKEN`).

### 6. Contrôles
- `node tools/check-external-urls.mjs` (aussi exécuté par `pnpm check`) échoue si une URL externe apparaît dans le code livré.
- Les tests `no-egress` (API et navigateur) échouent si l'application tente une requête vers un hôte public.
- Recette sur `kind` coupé de l'extérieur : voir le journal de la tâche T-0076 (`docs/dev/tasks/T-0076/CONTEXT.md`).

Le niveau de protection de l'instance (bandeau et mention des exports) se règle par `protectionLevel` (variable `ATHENA_PROTECTION_LEVEL`).

Rôles Keycloak de l'instance Défense : `athena-qa` (assurance qualité étatique : lecture seule, approbation des jalons et baselines) s'ajoute à `athena-admin`, `athena-pm` et `athena-user`. Le royaume de développement fournit le compte `qa.dev`. Les listes d'ayants droit et le contrôle export sont appliqués par la base (politiques RLS restrictives, migrations 039 et 040) : aucune configuration supplémentaire.

## Recette Kubernetes locale (kind)

Un déploiement réel du chart a été réalisé le 2026-10-31 sur un cluster `kind` (Kubernetes 1.32) : PostgreSQL 16 en pod, images `athena-api` et `athena-web` chargées avec `kind load docker-image`, rendu du chart avec `helm template` puis `kubectl apply`.

Séquence : secrets `athena-migration` (compte propriétaire) et `athena-env` → job de migration (21 migrations appliquées) → création du rôle de connexion applicatif membre de `athena_app` (`create role … in role athena_app`, sans `bypassrls`) → API, worker et web démarrent. Vérifié : le web relaie `/v1` et `/auth` vers l'API (401 sans jeton, `{"authenticated":false}`), en-têtes de sécurité présents.

Constats corrigés ou à connaître :
- nginx résout le service API sans liste de recherche DNS : l'amont est maintenant le nom complet `athena-api.<espace>.svc.<clusterDomain>` (valeur `clusterDomain`, défaut `cluster.local`).
- Le worker refuse de démarrer en production sans `OPENBAO_ADDR` et `OPENBAO_TOKEN` (garde-fou voulu).
- Politiques réseau éprouvées le 2026-10-31 sur un cluster `kind` avec Calico 3.29 (le CNI par défaut de `kind` ne les applique pas) : un pod quelconque atteint le web (401 relayé de l'API) mais **pas l'API directement** ; le web atteint l'API mais **pas PostgreSQL** ; l'API atteint PostgreSQL ; migration, API et worker démarrent avec les politiques actives. À refaire sur le CNI du cluster cible.
- Non couvert : ingress TLS, Keycloak dans le cluster, réplicas multiples sous charge, sauvegarde/restauration.

## Distribution du CLI

La CI produit `dist-cli/athena-cli-<version>.tgz` (job `package-cli`). Installation : `npm install -g athena-cli-<version>.tgz` (Node 22). Production locale : `pnpm --filter @athena/cli pack`.

## Démarrage local

`node tools/dev-start.mjs` (infra `deploy/dev` démarrée, API construite) crée et amorce la base `athena_dev` au premier lancement puis lance API (3001), worker et web (3000). Connexion : `user.dev` / `dev-only-user`.

## Montée de version : clés d'item (migration 030)
La migration 030 réécrit les clés des artefacts au format `PROJET-TRACKER-0042` et garde les anciennes comme alias (table `artifact_key_alias`). Elle s'applique au démarrage de l'API ou du job de migration, dans une transaction. Ensuite, pour chaque projet dont l'historique est dans GitLab, lancer une fois (compte administrateur) :
```
curl -X POST -H "Authorization: Bearer $TOKEN" https://<athena>/v1/projects/<PROJET>/history/migrate-keys
```
La réponse indique les fichiers renommés (`moved`), les anciens fichiers supprimés parce que le nouveau existait déjà (`removed`) et le SHA du commit (`null` si rien à faire). L'appel est idempotent. Tant qu'il n'est pas fait, les nouveaux événements s'écrivent déjà au nouveau chemin ; seuls les anciens fichiers restent à l'ancien nom. La clé d'un projet ne peut plus être modifiée dès qu'il contient des items.
