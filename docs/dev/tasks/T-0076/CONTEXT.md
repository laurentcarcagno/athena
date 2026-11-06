# Journal de la tâche T-0076

## Fait
- `tools/check-external-urls.mjs` : échoue (code 1) si le code livré (interface, feuilles de style, HTML, images, chart, API hors tests) contient une URL http(s) dont l'hôte n'est ni local, ni interne (`.lan`, `.local`, sans point), ni un espace de noms ou texte de documentation jamais interrogé. `--dist` contrôle aussi `apps/web/dist` (vérifié : aucune URL externe, polices IBM Plex servies par `@fontsource`). Exécuté par `apps/api/src/testing/isolated.test.ts`, donc par `pnpm check`.
- `tools/export-bundle.mjs` + `tools/bundle-lib.mjs` : lot transférable (images `docker save`, chart, `values-isolated.yaml`, `coredns-isolated.yaml`, `load-bundle.sh`, `manifest.json`, `SHA256SUMS`), `--verify`, `--dry-run`.
- Chart : `values-isolated.yaml`, `templates/isolated.yaml` (Keycloak, OpenBao en StatefulSet avec TLS interne), politiques réseau du mode isolé (aucune sortie HTTPS générique ; DNS limité à l'espace de noms du DNS du cluster ; OpenBao sans sortie), `coredns-isolated.yaml`.
- `tools/helm-docker.sh` : helm dans un conteneur. Documentation : section « Réseau isolé » de `docs/admin/INSTALLATION.md`.
- Tests : `isolated.test.ts` (9).

## Recette sur `kind` (2026-11-06), déploiement complet
Cluster `kind` v0.27 (Kubernetes 1.32.2), Calico 3.29.1, images chargées depuis un « registre interne » simulé (`reg.test/athena/*`, `imagePullPolicy: Never`), chart rendu par `helm template -f values-isolated.yaml`.
- Déployés : PostgreSQL (hors chart), migrations (41 appliquées), API (2), worker, web (2), **Keycloak** (royaume de développement importé depuis une ConfigMap), **OpenBao** (initialisé, descellé, moteurs `secret` et `transit`, politique `athena-api`, jeton applicatif dans `athena-env`).
- Défauts du chart trouvés par la recette et corrigés : OpenBao tourne sous l'utilisateur nommé `openbao` (uid 100, gid 1000), donc `runAsNonRoot` échouait → identifiants numériques fixés ; le script d'entrée de l'image charge déjà `/openbao/config`, notre `-config` ouvrait un second écouteur (« address already in use ») → retiré ; Keycloak construit au démarrage avec l'image standard et exige un système de fichiers inscriptible → `isolated.keycloak.optimizedImage` (lecture seule avec une image optimisée).
- Parcours de bout en bout dans le cluster : jeton Keycloak du cluster pour `admin.dev` (API : `/v1/me` 200, gabarits livrés listés), création d'un projet Spatial (11 trackers, version 1.1, criticité B, phase `requirements`) et d'un projet Défense (12 trackers) ; `qa.dev` lit les approbations (200) et ne peut rien écrire (403).
- Sorties depuis le **vrai pod API** (binaire node du conteneur) : 1.1.1.1:443 et 8.8.8.8:53 bloqués ; Keycloak:8080 et OpenBao:8200 ouverts ; web:8080 bloqué. Matrice complète des politiques (pods de test étiquetés) : api/web/worker/keycloak/openbao n'atteignent que ce que le chart autorise.
- **DNS** : avec le `forward` par défaut de CoreDNS, le pod API résout `example.com` (canal de sortie par le DNS). Après `coredns-isolated.yaml` : `example.com` échoue (`EAI_AGAIN`), `athena-keycloak` et `athena-openbao` se résolvent.

## Écarts
- Aucun.
