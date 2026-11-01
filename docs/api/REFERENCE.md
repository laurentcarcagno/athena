# Référence de l'API REST (v1)

Authentification : cookie de session (application web, écritures avec en-tête `X-CSRF-Token`) ou jeton `Authorization: Bearer <JWT Keycloak>` (intégrations, audience `athena-api`). L'organisation vient du groupe Keycloak `/org-<clé>`. Erreurs : `{ "error", "message", "details": [] }` avec les statuts 401, 403, 404, 409 (conflit de version ou doublon), 422 (validation), 429 (limitation de débit), 503 (service non configuré).

## Projets et trackers
| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/v1/projects` | liste |
| POST | `/v1/projects` | créer `{key, name}` (admin) |
| GET | `/v1/projects/:p/trackers` · `/:t` | liste, définition |
| POST | `/v1/projects/:p/trackers` | créer (admin) |
| POST | `/v1/projects/:p/trackers/:t/fields \| statuses \| transitions` | évolutions de configuration (admin) |
| GET | `/v1/field-types` | types de champ disponibles |

## Artefacts
| Méthode | Chemin |
|---|---|
| POST | `/v1/projects/:p/trackers/:t/artifacts` `{values}` |
| GET / PATCH | `/v1/projects/:p/artifacts/:key` (PATCH : `{values, version}`) |
| POST | `…/artifacts/:key/transitions` `{name, version}` · `/restore` `{version, expectedVersion}` |
| GET | `…/history` · `…/links` · `…/comments` · `…/doc-links` · `…/code-refs` |
| POST | `…/links` `{to, type}` · `/comments` `{body}` · `/doc-links` `{source, uid}` · `/branch` · `/merge-request` |
| GET | `/v1/projects/:p/search?q=<ATQL>&limit=&offset=` |

## Pilotage
`boards`, `boards/:b`, `boards/:b/cards/:key/move`, `sprints` (+ `/items`, `/start`, `/close`, `/burndown`), `velocity`, `flow?days=`, `roadmap`, `releases`, `dashboard?by=<champ>` (tous sous `/v1/projects/:p/`).

## Acteurs de projet
`GET /v1/users` (admin, chef de projet : comptes connus), `GET /v1/projects/:p/members`, `PUT /v1/projects/:p/members/:subject` (`{role: manager|member}`) et `DELETE` (administrateur, ou chef désigné du projet). Les écritures de gestion de projet (`boards`, `sprints`, `releases`, `start`, `close`, `publish`) exigent le même droit. `GET /v1/projects/:p/sprints` liste les sprints.

## Intégrations (admin)
- Webhooks sortants : `GET/POST /v1/webhooks`, `GET /v1/webhooks/:id/deliveries`, `POST /v1/webhooks/deliveries/:id/replay`. Enveloppe `{id, type, version, occurredAt, organization, data}`, en-tête `Athena-Signature: t=<s>,v1=<hmac-sha256 de "t.corps">` ; tolérance 5 min.
- Webhooks entrants génériques : `POST /v1/projects/:p/inbound-sources` puis `POST /hooks/in/source/:org/:p/:nom` (signature HMAC sur le corps brut, `Idempotency-Key`).
- GitLab : `…/integrations/gitlab` et `…/integrations/history` (secrets), réception `/hooks/in/gitlab/:org/:p` et `/hooks/in/history/:org/:p`.
- Automatisations : `…/automations`, `/v1/automations/:id/(enable|disable|runs)`.
- Plugins : `GET/POST /v1/plugins`, `POST /v1/plugins/:id/(enable|disable)`.
- Documentation StrictDoc : `…/docs/:source/index`, `/sync`, `/coverage`. Baselines : `…/baselines`, `…/baselines-diff?from=&to=`. Reconstruction : `POST …/rebuild`. Import : `POST …/import`.

Santé : `GET /healthz`. Un schéma OpenAPI généré n'est pas encore publié.

## Schéma OpenAPI

`GET /v1/openapi.json` (authentifié) renvoie le document OpenAPI 3.1 généré depuis les contrôleurs : routes, paramètres, codes de succès, rôles requis (`x-athena-roles`) et schémas de sécurité. Les corps sont décrits (JSON Schema, via `@BodySchema(schema)`) pour toutes les routes qui reçoivent un corps JSON validé ; l envoi de fichier est décrit en `application/octet-stream` ; les routes sans corps (actions) n en ont pas ; un test vérifie qu aucune nouvelle écriture n est ajoutée sans corps documenté.
