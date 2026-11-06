# Journal de la tâche T-0076

## Fait
- `tools/check-external-urls.mjs` : échoue (code 1) si le code livré (interface, feuilles de style, HTML, images, chart, API hors tests) contient une URL http(s) dont l'hôte n'est ni local, ni interne (`.lan`, `.local`, sans point), ni un espace de noms ou texte de documentation jamais interrogé. `--dist` contrôle aussi `apps/web/dist` (vérifié : aucune URL externe, polices IBM Plex servies par `@fontsource`, même origine). Exécuté par `apps/api/src/testing/isolated.test.ts`, donc par `pnpm check`.
- `tools/export-bundle.mjs` + `tools/bundle-lib.mjs` : lot transférable (images `docker save` : Athena, PostgreSQL, Keycloak, OpenBao ; chart ; `values-isolated.yaml` ; `load-bundle.sh` ; `manifest.json` ; `SHA256SUMS`), `--verify`, `--dry-run`. `load-bundle.sh` vérifie les sommes avant de charger et de pousser vers le registre interne.
- Chart : `values-isolated.yaml`, `templates/isolated.yaml` (Keycloak, OpenBao en StatefulSet avec TLS interne, Ingress Keycloak), politiques réseau du mode isolé (aucune sortie HTTPS générique ; API et worker : base, Keycloak, OpenBao, `internalCidrs` ; DNS limité à l'espace de noms du DNS du cluster ; OpenBao sans sortie).
- `tools/helm-docker.sh` : exécute helm dans un conteneur (helm n'est pas installé sur le poste). `helm lint` et `helm template` (modes normal : 12 objets, isolé : 20 objets) passent.
- Documentation : section « Réseau isolé » de `docs/admin/INSTALLATION.md`.
- Tests : `isolated.test.ts` (8).

## Recette sur `kind` (2026-11-06)
Cluster `kind` v0.27 (Kubernetes 1.32.2) sans CNI par défaut, Calico 3.29.1 ; pods de test busybox étiquetés comme les composants du chart (api, web, worker, keycloak, openbao) et une base dans un autre espace de noms ; politiques rendues par `helm template -f values-isolated.yaml` avec `databaseCidr` = IP de la base.

Sans politique : tous les pods joignent 1.1.1.1:443 et 8.8.8.8:53.
Avec les politiques isolées :
- ouvert : api → keycloak:8080, openbao:8200, base:5432 ; web → api:3001 ; worker → openbao:8200, base:5432 ; keycloak → base:5432.
- bloqué : api → 1.1.1.1:443, 8.8.8.8:53, web ; web → keycloak, 1.1.1.1:443 ; worker → 1.1.1.1:443, keycloak ; keycloak → 1.1.1.1:443, openbao ; openbao → base, 1.1.1.1:443.

## Limites assumées
- La recette porte sur les politiques réseau et le rendu du chart ; le déploiement complet d'Athena, Keycloak et OpenBao dans `kind` n'a pas été rejoué (images tierces non transférées dans le cluster).
- Le DNS du cluster peut relayer des noms vers l'extérieur si CoreDNS a un résolveur amont : sur le réseau isolé, CoreDNS ne doit avoir aucun amont (à vérifier sur le cluster cible).

## Écarts
- Aucun écart sur les critères de la fiche.
