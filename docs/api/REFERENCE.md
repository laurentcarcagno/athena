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
| GET / PATCH | `/v1/projects/:p/artifacts/:key` (PATCH : `{values, version}`) ; `:key` est la clé canonique ou une ancienne clé, la réponse porte toujours la clé canonique |
| POST | `…/artifacts/:key/transitions` `{name, version}` · `/restore` `{version, expectedVersion}` |
| GET | `…/history` · `…/links` · `…/comments` · `…/doc-links` · `…/code-refs` |
| POST | `…/links` `{to, type}` · `/comments` `{body}` · `/doc-links` `{source, uid}` · `/branch` · `/merge-request` |
| GET | `/v1/projects/:p/search?q=<ATQL>&limit=&offset=` |

## Pilotage
`boards`, `boards/:b`, `boards/:b/cards/:key/move`, `sprints` (+ `/items`, `/start`, `/close`, `/burndown`), `velocity`, `flow?days=`, `roadmap`, `releases`, `dashboard?by=<champ>` (tous sous `/v1/projects/:p/`).

## Disposition de la vue détails
`layout` (optionnel) à la création d'un tracker (`POST /v1/projects/:p/trackers`) et dans les templates : `{sections: [{title, fields: [{key, span: 1|2|3}]}]}` (20 sections et 100 attributs au plus ; chaque clé existe et n'est placée qu'une fois). `PATCH /v1/projects/:p/trackers/:t/layout` avec `{layout: {...} | null}` (administrateur) la remplace ; `null` revient à la disposition automatique. La définition d'un tracker renvoie `layout`. Chaque changement incrémente la version du schéma et est versionné dans `tracker.yaml`.

## Templates de projet
`GET /v1/project-templates`, `POST /v1/project-templates` (`{key, name, description?, trackers[]}` ou `{key, name, fromProject: {project, trackers?}}`), `PUT /v1/project-templates/:key` (`{name, description?, trackers[]}`), `DELETE /v1/project-templates/:key` (administrateur). Tous les templates se modifient, y compris les templates livrés : la modification enregistre une version de l'organisation sous la même clé, qui remplace la version livrée (`builtin: true`, `modified: true`). `DELETE` d'un template livré modifié rétablit sa version d'origine ; d'un template livré intact, il répond 409. Les trackers d'un template de projet peuvent aussi être désignés par `trackerTemplates: [clé]` ; les trois sources (`trackers`, `fromProject`, `trackerTemplates`) se combinent. Templates de tracker : `GET /v1/tracker-templates`, `POST /v1/tracker-templates` (`{key, name, description?, tracker}` ou `{key, name, fromTracker: {project, tracker}}`), `PUT /v1/tracker-templates/:key` (`{name, description?, tracker}`), `DELETE /v1/tracker-templates/:key` (mêmes règles que pour les templates de projet). `POST /v1/projects` accepte `template` (clé d'un template) et crée alors les trackers du template ; la réponse liste les trackers créés.

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

## Clés d'item

Format `<PROJET>-<TRACKER>-<n>` avec `n` sur 4 chiffres au moins (`SAT1-REQ-0042`), unique dans l'organisation, jamais modifiée. Les clés `<TRACKER>-<n>` d'avant la migration 030 sont conservées comme **alias**, uniques dans leur projet : toute route qui prend une clé d'artefact accepte l'une ou l'autre, et l'ATQL `key = …` / `key IN (…)` de même. Les réponses, les événements, les webhooks sortants (champ `key`) et l'historique Git portent la clé canonique (changement visible pour les intégrations qui lisaient l'ancienne). Une ancienne clé citée hors d'un contexte de projet n'est pas résolue. `POST /v1/projects/:p/history/migrate-keys` (administrateur, idempotent) renomme en un commit les fichiers d'historique de l'ancien format ; le YAML d'un artefact porte alors `aliases: [REQ-42]`.

## Types de tracker

Chaque tracker peut dériver d'un **type d'organisation** (`typeKey`). `GET /v1/tracker-types` liste les types (Exigence, Interface, Conception, Tâche, Anomalie, Évolution, Cas de test, Campagne, Non-conformité, Risque, Action, Décision, Revue) avec `category` (`engineering`, `development`, `verification`, `management`), `defaultViews` (`tableau`, `board`, `arbre`, `matrice`, `document`, `timeline`, `calendrier`) et `baseFields` (socle de champs proposé à la création). `POST /v1/tracker-types` (`{key, name, description?, category, defaultViews, baseFields?}`), `PUT /v1/tracker-types/:key` et `DELETE /v1/tracker-types/:key` (administrateur) : modifier un type livré enregistre une version de l'organisation (`modified: true`), la supprimer rétablit la version livrée ; un type utilisé par un tracker ne se supprime pas (409). `PATCH /v1/projects/:p/trackers/:t/type` avec `{typeKey: "task" | null}` (administrateur) rattache ou détache un tracker. `typeKey` figure dans la liste et la définition des trackers, dans `tracker.yaml` (`type`) et dans les templates. Un tracker sans type reste valide (catégorie « Autres »).

## Modules d'un projet

`GET /v1/projects/:p/modules` renvoie `{modules: [...]}` : les onglets actifs du projet, toujours dans l'ordre fixe `overview`, `trackers`, `planning`, `traceability`, `documents`, `code`, `activity`, `members`. `overview`, `trackers`, `planning`, `activity` et `members` sont toujours présents ; `traceability` suppose au moins un type de lien dans le projet, `documents` une source documentaire indexée, `code` un dépôt de code lié.

`GET /v1/projects/:p/overview` renvoie `{trackers: [{key, name, typeKey, category, artifacts, mine, lastActivity, statuses: [{key, name, category, count}]}]}` : la carte des trackers du projet. `category` vient du type du tracker (`engineering`, `development`, `verification`, `management`) ou vaut `other` sans type ; `mine` compte les items non terminés dont le champ de rôle assignee vaut l'identifiant de l'appelant.

## Vues enregistrées d'un tracker

`GET /v1/projects/:p/filters?tracker=KEY` liste les vues personnelles et partagées de ce tracker (la vue par défaut en premier) ; sans `tracker`, les filtres de projet de la page Recherche, comme avant. `POST …/filters` accepte en plus `trackerKey`, `view` (`tableau`…), `columns` et `isDefault` ; la `query` ne contient pas la clause `tracker =` (l'écran Tracker l'ajoute), et peut porter un `ORDER BY`. Une vue par défaut est partagée et rattachée à un tracker, il n'y en a qu'une par tracker, et seuls les chefs de projet et les administrateurs la choisissent. `PATCH …/filters/:id` avec `{isDefault: true|false}` la définit ou la retire.

Le board d'un tracker n'est pas stocké : `GET /v1/projects/:p/boards/~TRACKER` (et `POST …/boards/~TRACKER/cards/:key/move`) renvoie un board virtuel dont les colonnes sont les statuts du tracker, dans l'ordre, sans limite WIP. Il n'apparaît pas dans `GET …/boards`.

## Favoris et récents

Chaque utilisateur a ses favoris et ses récents (rail latéral), isolés par organisation. `GET /v1/me/pins` renvoie `{favorites, recents}` (favoris dans l'ordre choisi, huit récents au plus). `POST /v1/me/pins/visit` (`{kind, project, ref, label}`, `kind` : `project`, `tracker`, `view`, `item`) note l'ouverture d'un élément et élague au-delà de trente non épinglés. `PUT /v1/me/pins/favorite` (même corps + `favorite`) épingle ou désépingle ; `PUT /v1/me/pins/order` (`{ids}`) fixe l'ordre complet des favoris (un identifiant étranger est refusé). Une vue est désignée par `ref` = `TRACKER:identifiant` ; `…/t/TRACKER/tableau?v=identifiant` applique la vue enregistrée.

`GET /v1/projects/:p/activity` renvoie `{items, next, people}` : le flux du projet, du plus récent au plus ancien. Paramètres : `tracker`, `actor` (identifiant), `kind` (`created`, `updated`, `transition`, `comment`), `limit` (30 par défaut, 100 au plus) et `before` (curseur opaque renvoyé dans `next`). Chaque élément porte `kind`, `at`, `key`, `tracker`, `actor`, `actorName`, `fields` (champs modifiés, sans les champs à lecture restreinte pour le lecteur) et, pour une transition, `from` et `to` ; `people` liste les auteurs du projet pour alimenter le filtre.

`GET /v1/projects/:p/link-types` liste les types de liens du projet (`key`, `outwardLabel`, `inwardLabel`, `hierarchical`). `DELETE /v1/projects/:p/links/:id` supprime un lien du projet (404 pour un lien d'un autre projet) ; l'événement sortant est `link.deleted` (`from`, `to`, `type`, `actor`) et l'action d'audit `link.delete`.

## Types de liens d'organisation

`GET /v1/link-types` liste les types de l'organisation (`key`, `outwardLabel`, `inwardLabel`, `hierarchical`, `pairs: [{from, to}]` en clés de types de tracker, `builtin`, `modified`) ; `POST /v1/link-types`, `PUT /v1/link-types/:key` et `DELETE /v1/link-types/:key` (administrateur). Les six types livrés (`refines`, `satisfies`, `verifies`, `implements`, `blocks`, `duplicates`) sont des données : écrits en base à leur premier usage ou à leur première modification, la suppression d'un type livré modifié le rétablit. Un type porteur de liens ne se supprime pas et ne change pas de caractère hiérarchique (409). `GET /v1/projects/:p/link-types` renvoie les types utilisables dans le projet avec `scope` (`project` ou `organization`). Création d'un lien : un type d'organisation à paires refuse (422, message nommant la paire) un lien dont les trackers typés ne forment pas une paire dans le sens source → cible ; un tracker sans type ou un type sans paire n'est jamais contraint.

## Suspicion des liens

Un champ de tracker porte `isContent` (vrai par défaut), accepté à la création d'un tracker, d'un champ (`POST …/fields`) et dans `PATCH …/fields/:field`, exporté dans `tracker.yaml` (clé `isContent: false` seulement quand il est décoché) et repris par les templates. Un type de lien porte `propagatesSuspect` (vrai par défaut ; faux pour `blocks`). La modification d'un artefact ne passe les liens qui le visent à l'état suspect que si un champ de contenu a changé et si le type du lien propage la suspicion ; une transition ou la modification de champs hors contenu n'a aucun effet. La restauration d'une révision suit la même règle.

## ATQL : fonctions de traçabilité

`suspect()`, `linkedTo(CLÉ[, "type"])` et `notLinked(["type"])` sont des prédicats sans opérateur, insensibles à la casse, combinables par AND, OR, NOT et parenthèses. `CLÉ` est la clé canonique ou une ancienne clé du projet ; `type` est la clé d'un type de lien (projet ou organisation). Le lien compte dans les deux sens. Une clé inconnue ne donne aucun résultat ; un argument invalide donne une erreur 422 avec la position. Elles se compilent en sous-requêtes paramétrées, limitées au projet et à l'organisation de l'appelant.

`GET /v1/projects/:p/trackers/:t/tree[?parent=CLÉ]` renvoie `{items, total}` : les racines du tracker (items sans parent dans ce tracker) ou les enfants directs de `parent`, dans l'ordre de création. Chaque item porte `key`, `title` (la clé si le champ titre est à lecture restreinte), `status`, `statusName`, `category`, `childCount` et `suspect`. Convention : pour un type de lien `hierarchical`, le lien va de l'enfant vers le parent ; seuls les liens entre items du même tracker comptent.

`GET /v1/coverage-rules` liste les règles de couverture de l'organisation ; `POST /v1/coverage-rules` (administrateur) en crée une, `PUT /v1/coverage-rules/:key` la modifie (clé et portée figées), `DELETE /v1/coverage-rules/:key` la supprime. Les mêmes routes existent par projet : `POST /v1/projects/:p/coverage-rules`, `PUT` et `DELETE /v1/projects/:p/coverage-rules/:key`. Corps : `key`, `name`, `fromTracker`, `linkType`, `direction` (`in`, `out` ou `any`, défaut `any`), `minCount` (1 à 100, défaut 1), `statuses` (états visés, tous si vide), `threshold` `{target, warning?}` en pourcentage (l'alerte ne dépasse pas l'objectif). Une règle de projet remplace la règle d'organisation de même clé.

`GET /v1/projects/:p/coverage` calcule chaque règle applicable : `total` (items visés), `covered`, `rate` (pourcentage à une décimale, `null` si aucun item), `level` (`ok`, `warning`, `critical` ou `none`), `suspect` (items visés ayant un lien suspect de n'importe quel type), `gaps` (100 items en défaut au plus, avec titre ou clé si le titre est restreint), `atql` (requêtes ouvrant `total`, `gaps` et `suspect` ; `gaps` utilise `notLinked("type")` pour « au moins 1 lien, dans les deux sens » et `NOT linkCount("type", n[, "in"|"out"])` sinon) et `error` (tracker ou type de lien inconnu). Le calcul tient en moins de 2 s sur 100 000 artefacts.

`GET /v1/projects/:p/matrix?rows=TRACKER&cols=TRACKER&type=CLÉ[&offset=N][&rowOffset=N]` renvoie une tuile de la matrice de traçabilité `{type, rows, cols, totalRows, totalCols, uncoveredRows, links}` : au plus 500 lignes à partir de `rowOffset` (avec `linked`, vrai si la ligne a un lien de ce type avec un item de `cols`, même hors de la tuile) et 200 colonnes à partir de `offset`. `links` liste les cases remplies de la tuile (`row`, `col`, `suspect`), que le lien ait été créé dans un sens ou dans l'autre ; `uncoveredRows` compte les lignes sans lien sur tout le tracker. Titres restreints remplacés par la clé. 404 si un tracker ou le type de lien est inconnu. L'interface charge les tuiles au fil du défilement.

## Notifications et abonnements
Données personnelles de la personne connectée ; l'assurance qualité étatique (lecture seule ailleurs) peut aussi y marquer ses notifications lues et gérer ses abonnements.
- `GET /v1/me/notifications?unread=1&limit=50` : `{ items, unread }`. Un item porte `event` (`transition`, `comment`, `suspect`, `mention`, `approval`), `project`, `key`, `actor`, `actorName`, `payload` (clés et statuts, jamais de valeur de champ), `read`, `createdAt`.
- `POST /v1/me/notifications/read` : `{ ids: [...] | all: true, read: true|false }` marque lues (ou non lues) ses propres notifications.
- `GET /v1/me/notification-prefs`, `PUT /v1/me/notification-prefs/{event}` `{ enabled }` : réglage par événement (activé par défaut).
- `GET|PUT /v1/me/notification-digest` : résumé quotidien par courriel, `{ enabled, hour (0-23), timezone (IANA), locale (fr|en) }` ; `available` (lecture) est faux quand l'instance n'a pas de SMTP.
- `GET|POST /v1/projects/{project}/subscriptions` : abonnements de la personne ; corps `{ scope: item|tracker|view, ref }` (clé de l'item, clé du tracker, identifiant de la vue). `DELETE /v1/subscriptions/{id}`.
- Les notifications sont produites dans la transaction de l'événement et ne visent que les destinataires autorisés à lire l'item ; la lecture est filtrée par les mêmes règles (une notification d'un item devenu illisible n'est plus renvoyée).

