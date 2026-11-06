# Journal de la tâche T-0076

## Fait
- `tools/check-external-urls.mjs` : échoue (code 1) si le code livré (interface, feuilles de style, HTML, images, chart, API hors tests) contient une URL http(s) dont l'hôte n'est ni local, ni interne (`.lan`, `.local`, sans point), ni un espace de noms ou texte de documentation jamais interrogé. `--dist` contrôle aussi `apps/web/dist` (vérifié : aucune URL externe, polices IBM Plex servies par `@fontsource`). Exécuté par `apps/api/src/testing/isolated.test.ts`, donc par `pnpm check`.
- `tools/export-bundle.mjs` + `tools/bundle-lib.mjs` : lot transférable (images `docker save`, chart, `values-isolated.yaml`, `coredns-isolated.yaml`, `load-bundle.sh`, `manifest.json`, `SHA256SUMS`), `--verify`, `--dry-run`.
- Chart : `values-isolated.yaml`, `templates/isolated.yaml` (Keycloak, OpenBao en StatefulSet avec TLS interne), politiques réseau du mode isolé (aucune sortie HTTPS générique ; DNS limité à l'espace de noms du DNS du cluster ; OpenBao sans sortie), `coredns-isolated.yaml`.
- `tools/helm-docker.sh` : helm dans un conteneur. Documentation : section « Réseau isolé » de `docs/admin/INSTALLATION.md`.
- Tests : `isolated.test.ts` (9).

## Recette sur `kind` (2026-11-06) : `tools/recette-kind.sh`, reproductible, d'un seul tenant
Le script crée le cluster (kind v0.27, Kubernetes 1.32.2, sans CNI par défaut, Calico 3.29.1), **isole le DNS (`coredns-isolated.yaml`) avant tout déploiement**, charge les images comme depuis un registre interne (`reg.test/athena`, `imagePullPolicy: Never`), déploie le chart `values-isolated.yaml` (PostgreSQL hors chart, 41 migrations, API ×2, worker, web ×2, Keycloak avec le royaume importé, OpenBao initialisé), joue un parcours de bout en bout avec un jeton du Keycloak du cluster, puis **mesure la connectivité depuis les vrais pods du chart** (aucun pod de test) et détruit le cluster. Dernière exécution :

- Parcours : `admin.dev` `/v1/me` 200 ; projet Spatial créé (version 1.1) ; projet Défense créé (1.0) ; `qa.dev` lit 200 et écrit 403.
- Connectivité et DNS, mesurés depuis les pods api, worker, web, keycloak et openbao :

```
== 5. Connectivité mesurée depuis les vrais pods du chart
  api       -> 1.1.1.1:443            : BLOQUE
  api       -> 8.8.8.8:53             : BLOQUE
  api       -> 10.96.84.183:8080      : OUVERT
  api       -> 10.96.168.48:8200      : OUVERT
  api       -> 10.96.193.172:8080     : BLOQUE
  worker    -> 1.1.1.1:443            : BLOQUE
  worker    -> 10.96.84.183:8080      : BLOQUE
  worker    -> 10.96.168.48:8200      : OUVERT
  web       -> 10.96.35.80:3001       : OUVERT
  web       -> 1.1.1.1:443            : BLOQUE
  web       -> 10.96.84.183:8080      : BLOQUE
  keycloak  -> 1.1.1.1:443            : BLOQUE
  keycloak  -> 10.96.168.48:8200      : BLOQUE
  openbao   -> 1.1.1.1:443            : BLOQUE
  openbao   -> 10.96.84.183:8080      : BLOQUE
  DNS depuis le pod API : example.com = ECHEC EAI_AGAIN ; athena-keycloak = RESOLU 10.96.84.183
```

Défauts du chart trouvés par les recettes successives et corrigés : OpenBao sous l'utilisateur nommé `openbao` (identifiants numériques requis), second écouteur dû à `-config` redondant, Keycloak qui construit au démarrage (système de fichiers inscriptible, `optimizedImage`), DNS qui relayait vers l'extérieur (`coredns-isolated.yaml`).

## Écarts
- Aucun.
