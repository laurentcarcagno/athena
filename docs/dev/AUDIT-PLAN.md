# Audit du plan de développement (2026-11-18)

Relecture de `ATHENA_PLAN_DEVELOPPEMENT.md` (§ 1 à 25) contre le code, les tests, la CI et les documents. Méthode : pour chaque engagement précis du plan, recherche dans `apps/`, `packages/`, `deploy/`, `docs/` et `.gitlab-ci.yml`. Légende : ● couvert · ◐ partiel · ○ absent · Δ écart d'architecture assumé (à consigner dans un ADR).

Le tableau d'état du § 25 du plan (daté du 2026-10-31) est en avance sur la réalité sur plusieurs lignes : les écarts ci-dessous n'y figuraient pas.

## Ce qui est couvert (échantillon vérifié)
Trackers configurables, workflow et permissions par rôle (champ, transition), liens typés, historique GitLab (auteur réel, restauration, baselines, synchronisation inverse, rebuild), ATQL et recherche, boards, sprints, rapports, plugins (signature Ed25519, isolation, SDK, CLI), StrictDoc, webhooks entrants et sortants (HMAC, SSRF, idempotence), connecteur GitLab de code (références, transitions, branche, MR, rétroportages, DORA, notes de version), Keycloak (BFF, PKCE, back-channel), OpenBao KV et Transit, RLS, audit chaîné, gitleaks en CI, thèmes, FR et EN, e2e, accessibilité. Lots PPM 17 à 26.

## Écarts constatés

| # | Engagement du plan | Constat | Traitement |
|---|---|---|---|
| E1 | § 14.2 : authentification des services auprès d'OpenBao par Kubernetes ou **AppRole** | Seul `OPENBAO_TOKEN` statique est lu (`config.ts`, `secrets/openbao.ts`) | **Fait** : connexion AppRole (`OPENBAO_ROLE_ID`, `OPENBAO_SECRET_ID`), jeton renouvelé aux 2/3 de sa durée, reconnexion sur 403, une seule connexion pour des appels simultanés (6 tests). L'authentification Kubernetes d'OpenBao reste à configurer côté OpenBao : elle délivre un jeton que `OPENBAO_TOKEN` accepte |
| E2 | § 14.2 : identifiants PostgreSQL **dynamiques** (moteur database) | Absent | À faire : prise en charge de l'identifiant dynamique avec renouvellement |
| E3 | § 13.3 et 14.2 : **mTLS interne** par PKI OpenBao | Absent | Δ : relève de l'infrastructure (service mesh, certificats du reverse proxy) ; consigné dans l'ADR d'exploitation |
| E4 | § 3.1, 10 : **OpenTelemetry**, métriques RED Prometheus, tableaux Grafana, Loki, alertes (retard GitLab, échecs webhooks) | Seul `/healthz` existe | **Fait** : `GET /metrics` (jeton porteur `METRICS_TOKEN`, 404 sans lui) : RED par motif de route, jauges d'outbox et de webhooks ; propagation W3C `traceparent` et `X-Request-Id` ; règles d'alerte (`deploy/observability/athena-alerts.yml`) et tableau Grafana (`athena-grafana.json`). Les exports de traces vers un collecteur OpenTelemetry et Loki relèvent de l'infrastructure : l'identifiant de trace est déjà porté par chaque réponse |
| E5 | § 7.3, 14.1 : **jetons d'accès personnels** (hachés, portées, expiration, révocables) | Aucune route ni table | **Fait** (migration 086) : `athp_` + 256 bits, haché SHA-256, portée lecture ou écriture, expiration obligatoire (1 à 365 jours), révocable, valeur montrée une seule fois, 20 jetons actifs au plus, profil figé à la création, un jeton ne peut pas gérer les jetons ; page Profil ; 8 tests API et 3 tests web |
| E6 | § 10 : **RGPD**, export et effacement par utilisateur | Absent | **Fait** : export de ses données (`GET /v1/me/data-export`, bouton du profil), export et effacement par l'administrateur (`/v1/admin/users/:sub/...`), pseudonymisation du profil, suppression des données personnelles, révocation des jetons, trace d'audit sans donnée personnelle (3 tests) ; procédure et traitement de l'historique Git dans `docs/admin/RGPD.md` |
| E7 | § 3.1 : **GraphQL en lecture** | Absent | À faire : point d'accès en lecture seule |
| E8 | § 3.1, 9.4 : **temps réel** (SSE ou WebSocket) | Absent | À faire : SSE des notifications et des changements |
| E9 | § 7.3 : SDK générés **TypeScript et Python** | `plugin-sdk` et `cli` seulement ; aucun client d'API | À faire : clients générés depuis l'OpenAPI |
| E10 | § 13.2 : Semgrep, osv-scanner, SBOM CycloneDX, Trivy, cosign, ZAP, Schemathesis, fuzzing, k6, contrôle des commits signés | `.gitlab-ci.yml` : verify, commit-authors, secrets (gitleaks), audit, package-cli | À faire : jobs de CI et scripts (non exécutables ici, validés par analyse syntaxique) ; fuzzing des analyseurs en tests locaux |
| E11 | § 10 : sauvegarde, **PRA**, runbooks, RPO 15 min, RTO 2 h | Quelques lignes dans `INSTALLATION.md` | À faire : guide d'exploitation |
| E12 | § 3.1 : **Redis + BullMQ** pour les jobs | Aucun usage de Redis : outbox en PostgreSQL, boucles dans le worker, sessions en PostgreSQL | Δ : choix plus simple, sans perte fonctionnelle ; ADR |
| E13 | § 13.3 : limitation de débit par IP, token et organisation | En mémoire, par instance (doublée avec deux API) | À faire : compteur partagé en PostgreSQL |
| E14 | § 15.3 : **bibliothèque de champs partagés** | Absent | À faire |
| E15 | § 15.2 : **visibilité conditionnelle** des champs | Absent | À faire |
| E16 | § 15.3 : rôle **administrateur de tracker** distinct | Absent | À faire |
| E17 | § 17.2 : **réconciliation périodique** GitLab, rattrapage | Rattrapage initial présent ; réconciliation périodique absente | À vérifier puis faire |
| E18 | § 9.2 : `DiffViewer`, éditeur Markdown, `DatePicker`, `UserPicker`, Trusted Types | Absents du paquet `@athena/ui` sous ces noms | À vérifier composant par composant |
| E19 | § 6.1 : points d'extension `permissionProvider`, client en iframe sandboxée | Absents | À vérifier puis faire |
| E20 | § 23.1 décision 5 : thème clair seul | Dépassé : ADR-0004, thèmes clair et sombre | Plan à mettre à jour |
| E21 | § 25 : test d'intrusion externe, recette sur cluster, formation | Hors de portée du code | Commande et sessions : à la charge de l'organisation |

Chaque écart traité fait l'objet d'un commit ; la colonne « Traitement » est mise à jour au fil de l'eau.
