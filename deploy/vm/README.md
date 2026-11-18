# Déploiement sur machines virtuelles (Proxmox)

Deux voies de déploiement sont prises en charge, au choix de l'organisation (plan § 23.1, décision 12) :

| Voie | Quand la choisir | Fichiers |
|---|---|---|
| **Kubernetes** (Helm) | Un cluster existe déjà ; haute disponibilité et mises à jour sans coupure demandées | `deploy/helm/athena`, `docs/admin/INSTALLATION.md` |
| **Machines virtuelles** (Docker Compose) | Pas de cluster ; une petite équipe d'exploitation ; l'échelle du palier 2 (300 projets, 1 000 personnes) suffit | ce dossier |

Les deux voies utilisent les mêmes images (`deploy/docker/Dockerfile`, cibles `api` et `web`) et la même configuration applicative.

## Topologie conseillée (Proxmox)

| VM | Contenu | Ressources (palier 2) |
|---|---|---|
| `athena-app` | `docker compose` de ce dossier : 2 API, 1 worker, nginx (web) | 4 vCPU, 8 Go |
| `athena-pg` | PostgreSQL 16 (sauvegarde quotidienne, WAL archivés pour un RPO de 15 min) | 4 vCPU, 16 Go, disque SSD |
| existants | Keycloak, OpenBao, GitLab, MinIO/S3 | instances de l'organisation (plan, décisions 11 et 15) |

Aucun Redis n'est nécessaire : les sessions sont en PostgreSQL (`web_session`) et les tâches de fond (outbox, synchronisation GitLab, webhooks, jobs PPM) tournent dans le worker.

## Mise en service

1. Sur `athena-app` : installer Docker Engine et le plugin Compose, cloner le dépôt, `cd deploy/vm`.
2. `cp env.example .env`, renseigner les valeurs, `chmod 600 .env`.
3. `docker compose build`, puis `docker compose run --rm migrate`, puis `docker compose up -d`.
4. Placer devant le port `WEB_PORT` le reverse proxy TLS de l'organisation (TLS 1.2 minimum). `TRUST_PROXY=true` est déjà positionné : le proxy doit renseigner `X-Forwarded-For` et `X-Forwarded-Proto`.
5. Vérifier : `curl -fsS https://athena.exemple.lan/healthz`.

## Authentification d'Athena auprès d'OpenBao

Hors Kubernetes, utiliser **AppRole** (plan § 14.2) : créer un rôle `athena-api` dont la politique n'autorise que `athena/*` (KV v2), le moteur Transit des clés Athena, et fournir `OPENBAO_ROLE_ID` et `OPENBAO_SECRET_ID`. L'API échange ces deux valeurs contre un jeton de durée limitée, qu'elle renouvelle seule ; `OPENBAO_TOKEN` n'est qu'un repli d'essai. Le `secret_id` doit être à usage limité et renouvelé par rotation.

## Mises à jour

1. `git pull`, `docker compose build`.
2. `docker compose run --rm migrate` (migrations additives : les anciennes instances continuent de fonctionner pendant la migration).
3. Mise à jour par instance, sans coupure :
   ```
   docker compose up -d --no-deps --scale api=3 api      # une instance supplémentaire en version neuve
   docker compose up -d --no-deps --scale api=2 api      # retour à deux, les plus anciennes sont arrêtées
   docker compose up -d --no-deps worker web
   ```
   Un arrêt court est acceptable pour une mise à jour simple : `docker compose up -d`.

## Limites par rapport à Kubernetes

- Pas de reprise automatique si la VM tombe : s'appuyer sur la haute disponibilité de l'hyperviseur (redémarrage de la VM sur un autre nœud Proxmox).
- La limitation de débit est tenue **par instance** : avec deux API, la limite effective est doublée (voir `docs/security/REVUE.md`).
- Aucune politique réseau : cloisonner par pare-feu de l'hyperviseur (seul le port du reverse proxy est exposé ; `athena-pg` n'accepte que `athena-app`).
