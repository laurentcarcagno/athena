# ATHENA — Plan de développement

> Plateforme de suivi de travail (trackers + tickets + agile) combinant la souplesse de JIRA (workflows, boards, JQL, intégrations) et la modélisation par trackers configurables de Tuleap (artefacts, champs, liens de traçabilité, rapports). Extensible par plugins, interopérable par webhooks, historisation dans GitLab.

Version du document : 0.2 · Date : 2026-10-31 · Statut : proposition à valider
Révision 0.3 : interaction avec les dépôts de code GitLab (§ 17), interface moderne et intuitive (§ 18), continuité du développement avec un agent IA (§ 19).
Révision 0.2 : Keycloak + OpenBao (§ 14), sécurité intégrée au cycle de développement (§ 13), auteur unique pour les commits de développement d'Athena (§ 13.4), commits d'historique signés de leur auteur réel (§ 4, § 13.4), trackers multiples par projet (§ 15), liaison avec StrictDoc (§ 16).

---

## 1. Vision et périmètre

### 1.1 Objectifs
1. Offrir un **modèle de tracker configurable** (type Tuleap) : chaque tracker définit ses champs, statuts, transitions, règles et permissions.
2. Offrir l'**expérience de pilotage JIRA** : boards Kanban/Scrum, backlog, sprints, roadmap, dashboards, recherche en langage de requête, automatisations.
3. **Historiser chaque artefact dans GitLab** : l'historique des trackers est un historique Git (commits, diffs, blame, restauration), pas seulement un journal en base.
4. **Extensibilité par plugins** : champs, vues, workflows, actions, connecteurs, widgets de dashboard.
5. **Interopérabilité par webhooks** : sortants (événements Athena vers l'extérieur) et entrants (applications tierces vers Athena).
6. **Design Hemeria / THOR** (cf. `DESIGN.md` et `DESIGN.json` d'ARIANE) appliqué strictement.

### 1.2 Hors périmètre (v1)
- Gestion documentaire complète (wiki, GED) type Confluence.
- Hébergement de code et CI (délégué à GitLab).
- Application mobile native (la v1 est responsive, la PWA vient en v1.x).
- Marketplace publique de plugins (v2).

### 1.3 Personas
| Persona | Besoin principal |
|---|---|
| Contributeur / ingénieur | Créer, trier, mettre à jour ses artefacts vite, au clavier |
| Chef de projet / Scrum master | Boards, sprints, burndown, roadmap, rapports |
| Administrateur de tracker | Configurer champs, workflows, permissions sans code |
| Administrateur plateforme | Utilisateurs, SSO, plugins, webhooks, sauvegardes, audit |
| Intégrateur | API, webhooks, SDK de plugin |

---

## 2. Analyse fonctionnelle : le meilleur de JIRA et de Tuleap

| Domaine | Repris de JIRA | Repris de Tuleap | Choix Athena |
|---|---|---|---|
| Modèle de données | Issue types, hiérarchie Epic/Story/Sub-task | Trackers à champs libres, artefacts liés | **Trackers configurables** + hiérarchie et types de liens paramétrables |
| Workflow | Statuts, transitions, conditions, validators, post-functions | Transitions par champ de statut, règles dynamiques | Workflow visuel avec conditions, validations, post-actions (plugins) |
| Champs | Custom fields, écrans | Champs typés, calculés, listes liées, champs « artefact link » | Registre de types de champs extensible, formulaires multi-onglets |
| Recherche | JQL, filtres sauvegardés | Rapports de tracker, requêtes | **ATQL** (Athena Query Language) + filtres sauvegardés partageables |
| Agile | Backlog, sprints, boards, estimation, burndown | Planning par releases, cardwall | Boards Kanban/Scrum, sprints, releases, vélocité |
| Traçabilité | Liens basiques | Traçabilité exigences ↔ tests ↔ tickets, suivi des suspects | **Matrice de traçabilité** et détection des liens suspects après modification |
| Permissions | Schémas de permissions, rôles | Permissions par champ, par tracker, par groupe | RBAC par projet + permissions par champ et par transition |
| Notifications | Watchers, schémas | Notifications par tracker, mail-gateway | Abonnements, digests, canaux (mail, webhook, plugin) |
| Historique | Changelog en base | Historique des changements en base | **Historique Git dans GitLab** (diffs, restauration, audit signé) |
| Automatisation | Automation rules | Peu | Règles « quand / si / alors » + webhooks + plugins |
| Collaboration | Commentaires, mentions | Commentaires, suivi | Commentaires Markdown, mentions, pièces jointes, réactions |
| Qualité | — | Gestion de tests, traçabilité réglementaire | Plugin Tests (v1.x) |

---

## 3. Architecture cible

### 3.1 Stack proposée (cohérente avec l'écosystème Hemeria : React + TypeScript)
| Couche | Choix | Justification |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Partage de types, builds incrémentaux |
| Frontend | React 18 + TypeScript + Vite, TanStack Query/Router/Table | Aligné sur `Hemeria.tsx` d'ARIANE, tables denses performantes |
| Design system | Package `@athena/ui` (tokens Hemeria, CSS variables, composants) | Réutilisable par les plugins |
| Backend | Node 22 + TypeScript, NestJS (modulaire) sur Fastify | Modularité naturelle pour un noyau + plugins |
| API | REST (OpenAPI 3.1) + GraphQL en lecture + WebSocket/SSE temps réel | REST pour intégrateurs, GraphQL pour vues riches |
| Base de données | PostgreSQL 16 (JSONB, FTS, RLS) | Index et cache de requêtage, source opérationnelle |
| Recherche | PostgreSQL FTS en v1, OpenSearch optionnel en v1.x | Limiter la complexité initiale |
| Files / jobs | Redis + BullMQ | Webhooks, sync GitLab, notifications, automatisations |
| Stockage fichiers | S3-compatible (MinIO) | Pièces jointes |
| Authentification | **Keycloak** (OIDC, fédération LDAP/SAML, MFA), tokens d'accès personnels émis par Athena | Décision projet ; voir § 14 |
| Secrets et chiffrement | **OpenBao** (KV v2, Transit, secrets dynamiques PostgreSQL, PKI) | Décision projet ; voir § 14 |
| Git | GitLab (API v4 + webhooks GitLab) | Historique des trackers |
| Observabilité | OpenTelemetry, Prometheus, Grafana, Loki | Traçabilité et SLO |
| Conteneurs | Docker, Helm chart, docker-compose pour dev | Déploiement on-premise et cloud |

> Décision à valider : le choix Node/NestJS est une recommandation. Une alternative serait Kotlin/Spring ou Python/Django ; le plan reste valable, seuls les modules d'implémentation changent.

### 3.2 Vue d'ensemble
```
                    ┌──────────────────────────────────────────────┐
  Navigateur  ───►  │  Web (React, @athena/ui, Hemeria)            │
                    └───────────────┬──────────────────────────────┘
                                    │ REST / GraphQL / SSE
┌───────────────────────────────────▼───────────────────────────────────┐
│                             API Gateway (Fastify)                      │
│  Auth · RBAC · Rate limit · Validation · Audit                         │
├────────────────┬───────────────┬───────────────┬──────────────────────┤
│ Core Tracker   │ Agile         │ Search (ATQL) │ Notifications        │
│ (trackers,     │ (boards,      │               │                      │
│ artefacts,     │ sprints,      │               │                      │
│ workflows)     │ releases)     │               │                      │
├────────────────┴───────────────┴───────────────┴──────────────────────┤
│  Event Bus interne (outbox transactionnel)                             │
├──────────────┬─────────────────┬──────────────────┬───────────────────┤
│ Plugin       │ Webhook Engine  │ GitLab Sync      │ Automation Engine │
│ Runtime      │ (in/out)        │ (history writer) │                   │
└──────┬───────┴────────┬────────┴─────────┬────────┴───────────────────┘
       │                │                  │
   Plugins         Apps tierces         GitLab (repo d'historique)
                                   PostgreSQL · Redis · S3
```

### 3.3 Principes structurants
1. **Événements d'abord** : toute mutation produit un événement de domaine écrit dans une table *outbox* dans la même transaction. Webhooks, historique GitLab, notifications, automatisations et plugins consomment cette source unique.
2. **Source de vérité** : voir § 4. PostgreSQL sert au requêtage rapide ; GitLab détient l'historique canonique et permet la reconstruction complète de la base.
3. **Noyau minimal, tout le reste en extension** : les types de champs, widgets, actions de workflow et connecteurs livrés d'origine utilisent la même API de plugin que les plugins tiers.
4. **Idempotence partout** : clés d'idempotence sur l'API, les webhooks entrants et la synchronisation GitLab.
5. **Multi-tenant ready** : `organization_id` dans chaque table, RLS PostgreSQL.

---

## 4. Historisation dans GitLab

C'est le choix structurant du produit. Il faut le cadrer précisément.

### 4.1 Modèle
- **Un dépôt GitLab par projet Athena** (option : un dépôt par organisation avec un dossier par projet).
- **Un fichier par artefact**, au format YAML (lisible, diffable) :
  ```
  trackers/
    bug/
      tracker.yaml            # définition : champs, statuts, workflow, permissions
      artifacts/
        BUG-000142.yaml       # un artefact
        BUG-000142.comments/
          0001-2026-10-31T14-32-08Z.md
    story/
      ...
  boards/…  sprints/…  filters/…
  .athena/schema-version
  ```
- **Un commit par changement logique** (ou lot de changements groupés sur une fenêtre de 2 s pour le même auteur/artefact). Message structuré :
  `BUG-000142: status In Progress → Done` avec trailers Git (`Athena-Event-Id`, `Athena-Actor`, `Athena-Request-Id`).
- **Auteur = l'utilisateur Athena qui a fait la modification** (nom et e-mail issus du profil Keycloak). **Committer** = compte de service Athena. Le mécanisme est transparent : l'utilisateur n'a rien à configurer, ni clé ni identité Git.
- **Signature** : chaque commit est signé au nom de son auteur (voir § 13.4 pour le mécanisme et la décision ouverte).
- Le trailer `Athena-Actor` (identifiant opaque) et `artifact_revision` / `audit_log` recoupent l'identité Git, pour détecter une usurpation d'auteur.
- **Pièces jointes** : stockées en S3 ; le fichier artefact contient la référence et le hash SHA-256 (Git LFS en option).

### 4.2 Flux d'écriture
1. Mutation API → transaction PostgreSQL (état courant + événement outbox).
2. Worker `gitlab-sync` lit l'outbox, sérialise l'artefact, crée le commit via l'API Commits de GitLab (actions multiples atomiques).
3. L'identifiant du commit est stocké dans `artifact_revision.git_sha`.
4. En cas d'échec : retry avec backoff exponentiel, file de lettres mortes, alerte. Les mutations restent possibles (mode dégradé) ; la file se rejoue à l'ordre.

### 4.3 Fonctionnalités rendues possibles
- Onglet **Historique** : liste des commits de l'artefact, diff champ par champ (rendu Hemeria), qui/quand/pourquoi.
- **Restauration** d'une révision précédente (nouveau commit, jamais de réécriture).
- **Comparaison** entre deux dates ou deux releases (tags Git sur les baselines).
- **Baselines** : un tag Git = un instantané du tracker (exigences figées pour une release).
- **Blame** par champ.
- Audit externe : le dépôt peut être cloné, signé, archivé indépendamment d'Athena.

### 4.4 Synchronisation inverse (GitLab → Athena)
- Webhook GitLab *push* sur le dépôt : si un commit n'est pas d'origine Athena (édition directe, merge request), il est validé contre le schéma puis importé comme révision.
- Conflits : détection par `base_sha`; stratégie « dernière écriture validée gagne » avec création d'une révision de fusion et notification ; mode « merge request obligatoire » configurable par tracker (changements soumis à revue).
- **Reconstruction** : commande `athena rebuild --from-git` régénère la base entière depuis le dépôt.

### 4.5 Liens avec le code
- Références `BUG-142` dans les commits/MR des dépôts de code → liens automatiques sur l'artefact (via webhooks GitLab des dépôts applicatifs).
- Création de branche / MR depuis un artefact.
- Transition automatique (ex. MR mergée → statut « En revue QA »), via le moteur d'automatisation.

### 4.6 Risques spécifiques et parades
| Risque | Parade |
|---|---|
| Volumétrie (millions d'artefacts, dépôt lourd) | Sharding par tracker/projet, `git gc` planifié, commits groupés, tests de charge dès la phase 3 |
| Latence de l'API GitLab | Écriture asynchrone, la base reste la source de lecture temps réel |
| Indisponibilité GitLab | Outbox persistante, rejeu ordonné, indicateur de retard dans l'UI |
| Conflits d'édition | `base_sha` + verrou optimiste, politique configurable |
| Données sensibles dans Git | Champs marqués `confidential` : chiffrés via le moteur Transit d'OpenBao (clé par organisation, rotation, la clé ne quitte jamais OpenBao) avant commit ; analyse anti-secrets (gitleaks) avant chaque commit d'historique |

---

## 5. Modèle de données (noyau)

Entités principales (PostgreSQL) :

- `organization`, `project`, `user`, `group`, `role`, `membership`
- `tracker` (id, project_id, key, name, schema_version)
- `field_definition` (tracker_id, key, type, config JSONB, required, permissions)
- `workflow` / `status` / `transition` (conditions, validators, post_actions JSONB)
- `artifact` (id, tracker_id, number, key `BUG-142`, current_values JSONB, status_id, created_by, version, git_head_sha)
- `artifact_revision` (artifact_id, version, diff JSONB, git_sha, actor, event_id, at)
- `artifact_link` (from_id, to_id, link_type, suspect BOOLEAN)
- `link_type` (key, inward_label, outward_label, hierarchical BOOLEAN)
- `comment`, `attachment`, `watcher`, `reaction`
- `board`, `board_column`, `sprint`, `release`, `baseline`
- `saved_filter`, `dashboard`, `widget_instance`
- `webhook_endpoint`, `webhook_delivery`, `webhook_inbound_source`
- `plugin`, `plugin_installation`, `plugin_setting`, `plugin_storage`
- `automation_rule`, `automation_run`
- `outbox_event`, `audit_log`

Règles :
- Les valeurs de champs sont en JSONB validé par le schéma du tracker (JSON Schema généré), avec index GIN et colonnes générées pour les champs fréquemment filtrés.
- **Migration de schéma de tracker** : toute modification de champ crée une `schema_version`, une migration de données prévisualisée (dry run) et un commit `tracker.yaml`.
- Identifiants affichés en **IBM Plex Mono** (règle « Identifier-Is-Mono » de Hemeria).

---

## 6. Système de plugins

### 6.1 Points d'extension
| Point | Exemples |
|---|---|
| `fieldType` | Champ « Équipement », champ calculé, sélecteur d'utilisateur LDAP, champ géographique |
| `view` | Gantt, matrice de traçabilité, carte, vue calendrier |
| `dashboardWidget` | Burndown, camembert, flux d'activité, état du pipeline |
| `workflowCondition` / `workflowValidator` / `workflowAction` | « Revue par 2 personnes », « Appeler un service », « Créer une MR » |
| `automationTrigger` / `automationAction` | Déclencheurs et actions additionnels |
| `connector` | GitLab (livré), Slack/Teams, Jenkins, Sonar, SMTP |
| `importer` / `exporter` | Import JIRA/Tuleap/CSV, export ReqIF/PDF/Excel |
| `menuItem` / `panel` / `artifactTab` | Entrées de navigation, panneaux latéraux, onglets d'artefact |
| `apiRoute` | Endpoints REST sous `/plugins/<id>/…` |
| `permissionProvider` | Règles d'accès additionnelles |

### 6.2 Manifeste (`athena-plugin.json`)
```json
{
  "id": "com.exemple.traceability",
  "name": "Matrice de traçabilité",
  "version": "1.2.0",
  "athena": ">=1.0.0 <2.0.0",
  "permissions": ["artifacts:read", "links:read", "webhooks:emit"],
  "contributes": {
    "views": [{ "id": "trace-matrix", "entry": "ui/matrix.js" }],
    "fieldTypes": [],
    "hooks": ["artifact.updated", "link.created"]
  },
  "server": "dist/server.js",
  "settingsSchema": "settings.schema.json",
  "migrations": "migrations/"
}
```

### 6.3 Modèle d'exécution et sécurité
- **Serveur** : plugins exécutés dans un **worker isolé** (processus séparé ou V8 isolate / `isolated-vm`), communication par RPC ; pas d'accès direct à la base. Quotas CPU/mémoire/temps, appels sortants filtrés par liste d'hôtes autorisés.
- **Client** : composants chargés en **iframe sandboxée** ou Web Component avec API `@athena/plugin-sdk` ; thème Hemeria injecté via variables CSS ; interdiction de contourner les règles du design (contrôles de lint fournis).
- **Permissions déclaratives** : approuvées par l'administrateur à l'installation, appliquées à l'exécution.
- **Signature** des paquets (sigstore/minisign), vérification à l'installation, liste d'éditeurs de confiance.
- **Cycle de vie** : installer → configurer → activer → mettre à jour (migrations) → désactiver → désinstaller (avec politique de données).
- **Stockage plugin** : espace clé/valeur par plugin et par projet, quotas.
- **Compatibilité** : versionnage sémantique de l'API de plugin, matrice de compatibilité testée en CI.

### 6.4 Outillage développeur
- `@athena/plugin-sdk` (TypeScript, types générés depuis OpenAPI).
- `create-athena-plugin` (gabarit), `athena plugin dev` (rechargement à chaud contre une instance locale), `athena plugin pack/sign`.
- Documentation et 3 plugins de référence (champ personnalisé, widget, connecteur).

---

## 7. Webhooks et interopérabilité

### 7.1 Webhooks sortants
- Abonnement par projet/tracker/événement : `artifact.created|updated|deleted|transitioned`, `comment.created`, `link.created`, `sprint.started|completed`, `release.published`, `plugin.event.*`, etc.
- **Filtres** ATQL sur les événements (`status changed to Done AND priority = High`).
- **Charge utile** : enveloppe versionnée
  ```json
  { "id": "evt_01J…", "type": "artifact.transitioned", "version": "1",
    "occurredAt": "2026-10-31T14:32:08Z", "project": "ARI",
    "actor": { "id": "usr_…", "name": "…" },
    "data": { "artifact": { "key": "BUG-142", "…": "…" },
              "changes": [{ "field": "status", "from": "In Progress", "to": "Done" }] },
    "gitCommit": "a1b2c3d" }
  ```
- **Sécurité** : signature HMAC-SHA256 (`Athena-Signature: t=…,v1=…`), horodatage anti-rejeu, secret par endpoint avec rotation, HTTPS obligatoire (en production), liste d'adresses autorisées, protection SSRF (résolution DNS filtrée, blocage des réseaux privés sauf liste blanche admin).
- **Fiabilité** : livraison *at-least-once*, retries exponentiels (1 min → 24 h), désactivation automatique après N échecs, **journal des livraisons** avec requête/réponse, bouton « rejouer », test d'envoi.
- **Ordonnancement** : ordre garanti par artefact (clé de partition).

### 7.2 Webhooks entrants
- URL dédiée par source : `POST /hooks/in/{sourceId}`, authentification par secret/HMAC ou JWT.
- **Mappeurs** déclaratifs (JSONata) transformant la charge utile externe en commandes Athena (créer/mettre à jour/commenter/lier/transitionner).
- Connecteurs prêts à l'emploi : GitLab (issues/MR/pipelines), générique JSON, e-mail-to-ticket (via plugin).
- Idempotence par `Idempotency-Key` ou identifiant d'événement.

### 7.3 API publique
- REST OpenAPI 3.1, pagination par curseur, filtrage ATQL, `ETag`/`If-Match`, limitation de débit par token.
- Tokens personnels et comptes de service avec portées (scopes).
- SDK générés : TypeScript et Python.

---

## 8. ATQL — langage de requête

- Syntaxe proche de JQL : `project = ARI AND tracker = Bug AND status in (Open, "In Progress") AND assignee = currentUser() ORDER BY priority DESC`.
- Opérateurs, fonctions (`currentUser()`, `openSprints()`, `linkedTo(KEY, "blocks")`, `changedBy()`, `was`), historique via `HISTORY` (s'appuie sur les révisions).
- Grammaire formelle (PEG), compilation vers SQL paramétré, autocomplétion côté UI, validation avec messages précis.
- Utilisé par : filtres sauvegardés, boards, widgets, webhooks, automatisations, API.

---

## 9. Conception UX / UI (Hemeria · « The Tricolor Console »)

### 9.1 Règles à appliquer sans exception (extraites de `DESIGN.md`)
- `border-radius: 0` partout ; **aucune ombre** ; **aucun dégradé** ; pas de glassmorphism.
- Profondeur = couches tonales (Cold Mist → Instrument White → Hover Mist → Selection Veil) + bordures 1 px.
- **Console Sky `#006EB1` = action/sélection uniquement** ; **Tricolor Red `#C80A26` = cérémonie uniquement** (bandeau d'en-tête, point du logo) ; l'état « danger » utilise Signal Danger `#BA1A1A`.
- Typo : IBM Plex Sans (titres 600, corps 400 13 px) ; **IBM Plex Mono + tabular-nums pour tous les identifiants** (`BUG-142`, SHA de commit, horodatages, versions).
- Libellés/boutons/pastilles en MAJUSCULES, 700, interlettrage 0,12–0,18 em.
- Transitions 120 ms sur `filter`, `background`, `color`, sans transform.
- Textes d'interface sobres, sans exclamation ni formulation apologétique (« Artefact introuvable. Vérifiez la clé. »).
- Pas de `Card` imbriquée ; `CornerFrame` une seule fois par page ; `StatCard` jamais en grille 4 identiques.
- Éviter dès le départ la dette Bootstrap documentée dans ARIANE (modales, toasts, tri de tables).

### 9.2 Package `@athena/ui`
Construit en phase 1 à partir de `DESIGN.json` :
- **Tokens** : couleurs, typographie, espacements (4/8/12/20/24), mouvement, point de rupture 768 px, générés en CSS variables et module TypeScript depuis `DESIGN.json` (script `pnpm tokens:build`, test de non-régression sur les valeurs).
- **Composants** : `Btn` (primary/deep/ghost/danger), `StatusPill`, `Tag`, `FilterChip`, `SearchInput` (⌘K), `Field/Input/Select/Textarea`, `Card`, `StatCard`, `Table` + `Th sort` + `Td mono`, `Tabs`, `Modal` (focus trap, Esc, clic backdrop, bouton X), `Toast` (haut-droite, 5 s, pause au survol), `EmptyState`, `Sidebar`, `PageHeader` (bandeau tricolore), `CornerFrame`, `Toolbar/Footrow` à bordures partagées.
- **Ajouts nécessaires non couverts par Hemeria** (à documenter comme extensions et soumettre à validation design) : `Tree`, `Board/Card de ticket`, `Timeline/Gantt`, `DiffViewer`, `Editor Markdown`, `Menu contextuel`, `DatePicker`, `UserPicker`, `Skeleton`. Contraintes : mêmes règles (sharp, flat, tinted neutrals).
- **Accessibilité** : contrastes vérifiés (AA minimum), focus visibles (outline Console Sky), navigation clavier complète, `aria-*`, tests axe en CI.
- **Documentation** : Storybook avec une page par composant et les règles Do/Don't.
- **Lint design** : règle ESLint/stylelint interdisant `border-radius`, `box-shadow`, `linear-gradient`, `backdrop-filter`, couleurs hors tokens (et rouge hors liste autorisée).

### 9.3 Écrans principaux
| Écran | Contenu clé (Hemeria) |
|---|---|
| Tableau de bord | `PageHeader` (eyebrow « MISSION CONSOLE »), `StatCard` asymétriques, widgets plugins, un `CornerFrame` sur la zone principale |
| Liste d'artefacts | Toolbar (recherche ⌘K, `FilterChip`, ATQL) + table dense (en-têtes Deep Blue, ID en mono, `StatusPill`) + footrow |
| Artefact | Entête ID mono + titre, onglets (Détails · Liens · Pièces jointes · **Historique Git** · Activité), panneau latéral des champs, transitions de workflow |
| Board Kanban/Scrum | Colonnes = statuts, limites WIP, glisser-déposer au clavier et à la souris, swimlanes |
| Backlog & sprints | Deux volets, estimation, capacité, burndown |
| Roadmap | Timeline releases/epics |
| Configuration de tracker | Éditeur de champs, éditeur de workflow visuel, permissions, prévisualisation de migration |
| Traçabilité | Matrice + arbre + liens suspects |
| Admin | Utilisateurs, groupes, plugins, webhooks (journal de livraisons), GitLab (santé de sync), audit, sauvegardes |
| Recherche ATQL | Éditeur avec autocomplétion, résultats, enregistrement en filtre |

### 9.4 Interactions
- Raccourcis clavier globaux : `⌘K` recherche, `C` créer, `G` puis lettre pour naviguer, `?` aide.
- Édition en place des champs, enregistrement optimiste, indicateur d'état de synchronisation Git (pastille succès/avertissement/danger).
- i18n : français et anglais dès la v1 (clés de traduction, aucun texte en dur).
- Responsive : sidebar visible ≥ 768 px, tiroir en dessous.

---

## 10. Exigences non fonctionnelles

| Axe | Objectif |
|---|---|
| Performance | Liste de 10 000 artefacts < 1 s (virtualisation) ; création/MAJ d'artefact p95 < 300 ms ; recherche p95 < 500 ms |
| Scalabilité | 500 utilisateurs simultanés, 5 M artefacts par instance (v1) |
| Disponibilité | 99,9 % ; HA PostgreSQL/Redis ; dégradation gracieuse si GitLab ou plugin indisponible |
| Sécurité | OWASP ASVS niveau 2, CSP stricte, chiffrement en transit et au repos, secrets dans un coffre, SBOM, scan de dépendances, audit log immuable |
| Conformité | RGPD (export/effacement par utilisateur, hors historique Git : pseudonymisation documentée), journalisation d'accès |
| Observabilité | Traces distribuées, métriques RED, tableaux de bord, alertes (retard sync GitLab, taux d'échec webhooks) |
| Sauvegarde / PRA | Sauvegarde PostgreSQL + S3, RPO 15 min, RTO 2 h, reconstruction depuis Git testée trimestriellement |
| Maintenabilité | Couverture ≥ 80 % sur le noyau, ADRs, architecture hexagonale par module |
| Accessibilité | WCAG 2.1 AA |

---

## 11. Stratégie de test et qualité

- **Unitaires** (Vitest/Jest) : domaine, ATQL, moteur de workflow, sérialisation Git.
- **Intégration** : PostgreSQL/Redis réels via Testcontainers, **GitLab réel** (instance éphémère en CI) pour la synchronisation.
- **Contrat** : OpenAPI (Schemathesis), webhooks (schémas JSON versionnés), API de plugin (suite de conformité).
- **E2E** : Playwright (parcours critiques, dont clavier), captures de comparaison visuelle sur les composants Hemeria.
- **Performance** : k6 (scénarios liste, création, recherche, rafale de webhooks) ; seuils bloquants en CI nocturne.
- **Sécurité** : SAST, SCA, DAST (ZAP) en pipeline, tests SSRF/HMAC/sandbox plugin, revue de menace (STRIDE) par phase.
- **Chaos** : coupure GitLab, Redis, lenteur réseau ; vérification du rejeu de l'outbox.
- **Design conformité** : lint tokens + revue design à chaque phase UI.
- Definition of Done : tests, doc, i18n, accessibilité, métriques, migration, revue de sécurité si surface exposée.

---

## 12. Organisation et CI/CD

- **Dépôt** : monorepo `athena/` — `apps/web`, `apps/api`, `apps/worker`, `packages/ui`, `packages/core`, `packages/plugin-sdk`, `packages/atql`, `plugins/*` (plugins livrés), `docs/`, `deploy/`.
- **Branches** : trunk-based, PR courtes, revue obligatoire, commits conventionnels.
- **Pipeline** : lint → types → tests → build → images → scan → déploiement review-app → E2E → promotion.
- **Environnements** : dev (docker-compose), intégration, recette, production ; données de démonstration (seed).
- **Versionnage** : SemVer ; changelog généré ; migrations de base réversibles (expand/contract).
- **Équipe cible** (indicative) : 1 PO, 1 tech lead/architecte, 3 backend, 3 frontend, 1 designer système, 1 QA/SDET, 1 DevOps/SRE (0,5 à 1 ETP selon phase).

---

## 13. Sécurité intégrée au développement (SSDLC)

La sécurité est une exigence de chaque phase, pas une phase finale. Référentiel : OWASP ASVS niveau 2, OWASP SAMM, NIST SSDF.

### 13.1 Processus
| Étape | Pratique | Sortie |
|---|---|---|
| Conception | Modélisation des menaces (STRIDE) à l'ouverture de chaque phase, abuse cases en plus des user stories | Fiche de menaces versionnée dans `docs/security/` |
| Exigences | Exigences de sécurité tracées (ASVS) comme critères d'acceptation des stories | Liste de contrôle ASVS par phase |
| Code | Revue obligatoire, checklist sécurité dans le modèle de PR, validation des entrées par schéma, encodage des sorties | PR conformes |
| Intégration | Pipeline avec **portes de sécurité bloquantes** (voir § 13.2) | Rapport de pipeline |
| Livraison | Images signées, SBOM, provenance de build | Artefacts vérifiables |
| Exploitation | Journalisation de sécurité, alertes, rotation des secrets, mises à jour | Runbooks |
| Fin de phase | **Security gate** : menaces traitées, aucun défaut critique/élevé ouvert, tests d'abus passés | Go/no-go signé |

Rôle de « security champion » désigné dans l'équipe. Définition de « terminé » complétée : menace analysée, tests d'abus écrits, secrets hors du code, journalisation sans donnée sensible.

### 13.2 Chaîne d'outils dans la CI
- **Secrets** : `gitleaks` en pre-commit et en CI (bloquant) ; aucun secret dans le dépôt, les images ni l'historique.
- **SAST** : Semgrep (règles TypeScript/Node, JWT, injection, SSRF) ; règles personnalisées pour nos interdits (accès SQL non paramétré, `eval`, `child_process` hors liste).
- **SCA** : `osv-scanner` / `npm audit` avec seuil bloquant, Renovate pour les mises à jour, lockfiles figés, registre interne proxy.
- **SBOM** : CycloneDX généré à chaque build ; **licences** vérifiées.
- **Conteneurs et IaC** : Trivy (images, Helm, Dockerfile), images distroless non-root, système de fichiers en lecture seule.
- **Signature** : cosign pour les images, attestation de provenance (SLSA niveau 2 visé).
- **DAST** : OWASP ZAP sur l'environnement de recette à chaque version ; tests de l'API par Schemathesis.
- **Fuzzing** : parseur ATQL, mappeurs de webhooks entrants, import YAML des artefacts, import `.sdoc`.
- **Pentest** : interne à la fin de la phase 3 et de la phase 6, **externe** en phase 8.

### 13.3 Contrôles applicatifs prévus dès la phase 1
| Risque | Contrôle |
|---|---|
| Injection SQL / ATQL | Requêtes paramétrées uniquement ; ATQL compilé depuis un AST, jamais par concaténation |
| XSS | Markdown assaini (DOMPurify côté client, liste blanche côté serveur), CSP stricte sans `unsafe-inline`, Trusted Types |
| CSRF | Session par cookie `HttpOnly; Secure; SameSite=Strict` + jeton anti-CSRF (modèle BFF, § 14.1) |
| Contrôle d'accès | Autorisation vérifiée côté serveur sur chaque ressource (RBAC + champ + transition) ; **RLS PostgreSQL** en défense en profondeur ; tests d'accès croisés entre organisations/projets |
| SSRF | Webhooks et connecteurs : résolution DNS filtrée, blocage des réseaux privés et métadonnées cloud, redirections limitées |
| Téléversement | Liste de types, taille maximale, scan antivirus (ClamAV), stockage hors racine web, `Content-Disposition: attachment` |
| Déni de service | Limitation de débit par IP/token/organisation, pagination bornée, coût maximal des requêtes ATQL, quotas des plugins |
| Plugins hostiles | Isolation, permissions déclaratives, signature, appels sortants filtrés (§ 6.3) |
| Rejeu de webhooks | HMAC + horodatage + identifiant d'événement mémorisé |
| Traçabilité | Journal d'audit **chaîné par hachage** (chaque entrée contient le hash de la précédente), exporté vers un stockage en ajout seul |
| Fuite par journaux | Masquage systématique des jetons/secrets/champs confidentiels dans les logs et traces |
| Chaîne d'approvisionnement | Dépendances épinglées, revue des nouvelles dépendances, plugins signés |
| Configuration | Valeurs par défaut sûres, en-têtes de sécurité, TLS 1.2+ partout, mTLS interne via PKI OpenBao |

### 13.4 Règles de commit et de signature

**Commits de développement du dépôt Athena (code source)**
- **Auteur et committer uniques** : `Laurent Carcagno <laurent.carcagno@gmail.com>`.
- Pas de trailer `Co-Authored-By` ni de mention d'outil dans les messages.
- Application : `git config user.name/user.email` dans le dépôt, hook `commit-msg` + `pre-commit` qui refusent toute autre identité, et **contrôle en CI** (échec si un commit de la MR a un auteur ou un committer différent). Règle de push GitLab « adresse e-mail de l'auteur » en renfort si l'édition GitLab le permet.
- Commits signés (SSH ou GPG) ; vérification de la signature en CI et protection de branche « signed commits only ».
- Conventions : commits conventionnels, un changement logique par commit, rebase plutôt que merge.

**Commits d'historique des trackers (à l'exécution)**
- Transparents pour l'utilisateur : aucune configuration Git de sa part.
- **Auteur = l'utilisateur réel** (nom, e-mail du profil Keycloak). Committer = compte de service Athena.
- **Signature au nom de l'auteur** : à trancher entre
  1. *Signature SSH par utilisateur* : une clé Ed25519 par utilisateur dont le matériau reste dans le moteur Transit d'OpenBao (jamais exportable) ; Athena produit la signature au format SSH (`sshsig`) ; la clé publique est enregistrée automatiquement dans GitLab (compte ou clé de signature) lors de la première utilisation. Plus fidèle, plus complexe : à valider par un spike en phase 0.
  2. *Signature unique par le service* + attestation de l'auteur dans le trailer `Athena-Actor` et le journal d'audit chaîné. Plus simple, moins fort juridiquement.
  Recommandation : viser l'option 1 pour les trackers à exigence de traçabilité, option 2 par défaut.
- Si une édition directe est faite dans GitLab (synchronisation inverse, § 4.4), l'auteur du commit est conservé tel quel et la révision Athena est marquée « externe ».

---

## 14. Authentification, autorisation et secrets : Keycloak et OpenBao

### 14.1 Keycloak (identité)
- **Flux** : OIDC *Authorization Code + PKCE*. L'interface web passe par un **BFF** (backend for frontend) : les jetons restent côté serveur, le navigateur ne détient qu'un cookie de session `HttpOnly`.
- **Realms** : un realm par organisation (multi-tenance) ou un realm unique avec groupes ; à trancher (§ 23). Clients distincts : `athena-web` (confidentiel via BFF), `athena-api` (ressource), `athena-worker` et clients de service par intégration (`client_credentials`).
- **Fédération** : LDAP/Active Directory, SAML, fournisseurs OIDC tiers, via Keycloak ; Athena ne parle qu'à Keycloak.
- **Sécurité** : MFA (TOTP, WebAuthn) imposée aux administrateurs, politique de mots de passe, détection de force brute, durée de vie courte des jetons d'accès (5 min), rotation des *refresh tokens*, déconnexion *back-channel*, vérification JWT (signature JWKS, `iss`, `aud`, `exp`, `nonce`).
- **Rôles** : Keycloak porte l'identité, les groupes et les rôles « plateforme » (admin, utilisateur). Les droits **fins** (projet, tracker, champ, transition) restent dans Athena, mappés sur des groupes Keycloak.
- **Provisioning** : synchronisation des utilisateurs/groupes à la connexion et par webhook d'événements Keycloak ; désactivation immédiate d'un compte = révocation des sessions.
- **Jetons d'accès personnels (PAT)** et jetons de service pour l'API : émis par Athena, **stockés hachés**, portée limitée (scopes), expiration obligatoire, révocables, visibles une seule fois.
- Thème Keycloak personnalisé aux couleurs Hemeria (mêmes tokens, angles droits, aucune ombre), texte sobre.

### 14.2 OpenBao (secrets et chiffrement)
| Usage | Moteur / méthode OpenBao |
|---|---|
| Secrets statiques (jeton GitLab, secrets HMAC de webhooks, identifiants SMTP, paramètres sensibles de plugins) | KV v2 avec versionnage, chemins `athena/<org>/<projet>/…` |
| Identifiants PostgreSQL | Moteur *database* : identifiants dynamiques à durée limitée par service |
| Chiffrement des champs confidentiels, des secrets stockés en base, signatures de commits | Moteur **Transit** : clés par organisation, rotation, rewrap ; Athena n'a jamais la clé |
| Certificats internes (mTLS) | Moteur PKI, certificats courts renouvelés automatiquement |
| Authentification des services auprès d'OpenBao | Kubernetes auth (ou AppRole en dehors de Kubernetes), une politique par service, principe du moindre privilège |
| Jetons d'accès Keycloak (secret de client) | KV, injecté au démarrage via agent/CSI |

- **Exploitation** : stockage Raft en HA, *auto-unseal*, appareil d'audit activé et exporté, procédures de rotation et de récupération testées.
- **Plugins** : un plugin n'accède jamais directement à OpenBao. Il demande à Athena un secret déclaré dans son manifeste ; Athena le sert depuis `athena/plugins/<id>/…` selon la permission approuvée par l'administrateur.
- **Aucun secret** dans les variables d'environnement en clair, les images, les journaux ou l'historique Git.
- **Développement local** : instance OpenBao en mode dev et Keycloak préconfiguré (realm exporté) dans `docker-compose`, avec des secrets factices seulement.

---

## 15. Trackers multiples et configurables par projet

### 15.1 Principe
Un projet contient **un nombre quelconque de trackers** (Bug, Exigence, Story, Test, Risque, Changement…). Chaque tracker est autonome et entièrement configurable ; aucun tracker n'est codé en dur.

### 15.2 Ce qui est configurable, par tracker
| Élément | Détail |
|---|---|
| Identité | Nom, clé courte unique dans le projet (`BUG`, `REQ`), format de numérotation, icône, couleur de libellé (couleurs de signal uniquement, pas de rouge cérémoniel) |
| Champs | Types (§ 6.1 `fieldType`), obligatoire, valeur par défaut, aide, regroupement par onglets/sections, ordre, visibilité conditionnelle |
| Sémantique | Association de champs à des **rôles** (titre, description, statut, responsable, échéance, estimation) pour que boards, rapports et notifications fonctionnent quel que soit le tracker |
| Workflow | Statuts, transitions, conditions, validateurs, actions ; un workflow propre au tracker |
| Permissions | Par rôle et par groupe : voir, créer, modifier, commenter, supprimer ; par champ et par transition |
| Liens | Types de liens autorisés vers d'autres trackers (ex. `REQ` → `TEST` « vérifié par ») |
| Vues | Colonnes par défaut, filtres sauvegardés, board, mise en page du formulaire |
| Notifications, webhooks, automatisations | Réglés au niveau tracker, héritant du projet |
| Historique Git | Fichier `trackers/<clé>/tracker.yaml` versionné ; chaque changement de configuration est un commit |

### 15.3 Fonctions de gestion
- **Assistant de création** : à partir de zéro, d'un **gabarit** (catalogue intégré : Bug, Story, Exigence, Test, Risque, Changement) ou d'un autre tracker (duplication).
- **Export/import** de la définition d'un tracker (YAML) entre projets et instances.
- **Bibliothèque de champs partagés** au niveau projet ou organisation, pour réutiliser des listes de valeurs communes.
- **Évolution de configuration** : modification de champ, de statut ou de workflow produit une nouvelle `schema_version`, avec **prévisualisation de l'impact** (artefacts concernés, valeurs à migrer), migration différée et restauration.
- **Administration déléguée** : un rôle « administrateur de tracker » distinct de l'administrateur de projet.
- **Transversalité** : liens entre trackers du même projet (ou d'autres projets, selon droits), requêtes ATQL multi-trackers (`tracker in (BUG, REQ)`), boards et rapports mêlant plusieurs trackers.
- **Clé d'artefact** : `<CLÉ_TRACKER>-<n>`, unique dans le projet, séquence indépendante par tracker.

### 15.4 Modèle de données (précisions)
- `project 1—N tracker`, `tracker 1—N field_definition | status | transition | artifact`.
- Contrainte d'unicité `(project_id, tracker.key)` ; séquence `tracker_sequence` par tracker.
- `tracker_config_revision` : historique de configuration ; référence du commit Git.
- Les règles d'autorisation s'évaluent sur `(utilisateur, tracker, champ|transition)`.

### 15.5 Critères d'acceptation
- Créer 10 trackers dans un projet, tous différents, sans développement.
- Modifier un champ avec 50 000 artefacts : prévisualisation en moins de 5 s, migration sans interruption de lecture.
- Le board et les rapports fonctionnent sur un tracker dont les champs ont des noms différents, grâce à la sémantique.

---

## 16. Liaison avec la documentation StrictDoc

### 16.1 Constat sur StrictDoc (`C:\projects\AI\STRICTDOC`)
- Documents au format texte `.sdoc` : exigences et sections avec **UID**, grammaire personnalisable (`[GRAMMAR]`, champs ajoutables), relations `Parent` (exigence → exigence) et `File` (exigence → fichier source), marqueurs `@relation(UID, scope=…)` dans le code.
- Serveur web (`strictdoc server`) et export statique ; formats d'export/import à confirmer sur la version utilisée (HTML, ReqIF, RST, JSON selon le guide utilisateur `docs/strictdoc_01_user_guide.sdoc`).
- Les dépôts StrictDoc suivent leurs propres règles de développement (`AGENTS.md`, `CLAUDE.md`) : toute évolution **dans** StrictDoc se fait selon ces règles et avec accord préalable ; le plan ci-dessous n'impose aucune modification de StrictDoc pour la v1.

### 16.2 Principe : Athena référence, StrictDoc reste la source de la documentation
La documentation et les exigences continuent d'être rédigées dans StrictDoc. Athena les **indexe en lecture seule** et crée des liens bidirectionnels avec les artefacts.

### 16.3 Fonctionnalités
1. **Sources documentaires par projet** : configuration `projet → dépôt GitLab StrictDoc (+ branche/tag, chemin, URL du serveur ou de l'export HTML)`.
2. **Indexation** : un plugin `athena-strictdoc` récupère le dépôt en lecture seule (jeton de déploiement dans OpenBao), lit les `.sdoc` et alimente une table `doc_node` (`source`, `document`, `uid`, `type`, `titre`, `énoncé`, `statut`, `chemin`, `git_sha`, `hash du contenu`). Rafraîchissement sur webhook *push* GitLab et à la demande.
3. **Type de champ `sdocRef`** : sélecteur d'UID avec recherche, affichage du titre et de l'énoncé, lien direct vers la page StrictDoc. UID rendu en IBM Plex Mono (règle des identifiants).
4. **Type de lien `documenté par` / `spécifie`** entre un artefact et un nœud de documentation, configurable par tracker (§ 15.2).
5. **Liens inverses** : un champ personnalisé de la grammaire StrictDoc (par exemple `ATHENA_REFS: BUG-142, STORY-12`) est lu à l'indexation et crée les liens côté Athena. Les liens ne sont écrits **que dans un sens à la fois** par la même source de vérité, pour éviter les divergences : par défaut, la saisie se fait côté Athena et peut être reportée dans le `.sdoc` par **merge request** automatique, jamais par écriture directe.
6. **Onglet « Documentation liée »** dans l'artefact et **panneau « Artefacts liés »** exposé par une API (`GET /api/v1/doc-links/{uid}`) pour affichage côté StrictDoc si souhaité.
7. **Liens suspects** : le lien enregistre le `hash` du nœud au moment de la liaison ; si l'exigence change, le lien devient *suspect* (pastille d'avertissement, notification, webhook `link.suspect`) jusqu'à validation par un humain.
8. **Couverture de traçabilité** : exigences sans artefact, artefacts sans exigence, exigences sans test ; rapport et widget de dashboard. Extension possible au code via les marqueurs `@relation`.
9. **Baselines couplées** : une baseline Athena (tag Git) enregistre aussi le `git_sha` du dépôt StrictDoc, ce qui fige exigences et suivi ensemble.
10. **Actions** : « Créer un artefact depuis une exigence », ouverture de la page StrictDoc depuis l'artefact, recherche de documentation depuis ⌘K.
11. **Documentation d'Athena elle-même** : rédigée en `.sdoc` dans le dépôt, avec UID et marqueurs `@relation` dans le code, ce qui permet de tester la liaison en conditions réelles.

### 16.4 Sécurité de la liaison
- Les `.sdoc` sont des **entrées non fiables** : analyse dans un conteneur sans réseau, quotas CPU/mémoire/temps, aucun accès aux secrets.
- Énoncés rendus après assainissement (même chaîne que le Markdown des commentaires).
- Jeton GitLab en lecture seule, limité au dépôt de documentation ; stocké dans OpenBao.
- Écriture vers le dépôt documentaire uniquement par merge request, sous l'identité de l'utilisateur concerné (règle d'historique, § 13.4).

### 16.5 Critères d'acceptation
- Indexation du dépôt StrictDoc de référence en moins de 60 s ; rafraîchissement incrémental après un push en moins de 10 s.
- Un lien créé dans Athena apparaît dans l'interface StrictDoc (via l'API ou le champ `ATHENA_REFS`) sans intervention manuelle.
- La modification d'une exigence rend suspects tous les liens concernés en moins de 30 s.

---

## 17. Interaction avec les dépôts de code GitLab (bugs et tâches de développement)

### 17.1 Objectif et périmètre
Relier le travail de développement réalisé dans GitLab (commits, branches, merge requests, pipelines, déploiements) au suivi dans Athena, pour que **l'avancement d'une correction de bug ou d'une tâche se mette à jour sans saisie manuelle**.

Trois familles de dépôts GitLab coexistent dans un projet Athena, à ne pas confondre :
| Famille | Rôle | Accès d'Athena |
|---|---|---|
| Dépôt d'historique | Reflet Git des trackers (§ 4) | Lecture/écriture (service) |
| **Dépôts de code** (un ou plusieurs) | Code applicatif des projets suivis | Lecture + écritures limitées (branche, MR) |
| Dépôt de documentation | Fichiers StrictDoc (§ 16) | Lecture ; MR pour les écritures |

Configuration : écran « Dépôts liés » par projet (identifiant GitLab, branches suivies, mapping des environnements, règles d'automatisation).

### 17.2 Raccordement
- **Webhooks GitLab → Athena** (`/hooks/in/gitlab/{sourceId}`) : événements *push*, *merge request*, *pipeline*, *deployment*, *release*, *note*. Vérification du jeton secret en temps constant, liste d'adresses source autorisées, idempotence par identifiant d'événement.
- **Réconciliation périodique** par l'API GitLab (les webhooks peuvent se perdre) et **rattrapage initial** de l'historique à l'ajout d'un dépôt.
- **Jetons** : jeton de projet GitLab à portée minimale (lecture ; une portée d'écriture distincte, activée seulement si la création de branches/MR est utilisée), stockés dans OpenBao.

### 17.3 Références entre code et tickets
- La clé d'artefact (`BUG-142`) est reconnue dans : message de commit, titre et description de merge request, nom de branche (`bugfix/BUG-142-court-resume`).
- **Mots-clés d'action** configurables par tracker : `Refs` (simple lien), `Fixes` / `Closes` (résolution à la fusion), `Implements`, `Reverts`.
- La clé doit exister et l'auteur doit avoir le droit de modifier l'artefact. Correspondance **utilisateur GitLab ↔ utilisateur Athena** par e-mail vérifié (idéalement via l'identité Keycloak) ; à défaut, seul le lien est créé, sans transition.
- Un utilisateur ne voit des branches, commits et MR que s'il a accès au dépôt GitLab concerné (aucune fuite de noms de branches privées).

### 17.4 Panneau « Développement » dans l'artefact
- Branches, commits (SHA en IBM Plex Mono), merge requests (état, relecteurs, approbations), pipelines (pastilles succès / avertissement / danger), déploiements par environnement, version de correction.
- Actions : **créer une branche** au nom normalisé, **créer une MR en brouillon** pré-remplie (titre, clé, description), ouvrir le dépôt.
- Tout est en lecture seule sauf ces deux actions.

### 17.5 Transitions automatiques (règles par défaut, modifiables par tracker)
| Événement GitLab | Effet dans Athena |
|---|---|
| Branche créée ou premier commit référençant la clé | « À faire » → « En cours » |
| Merge request ouverte | → « En revue » |
| Pipeline en échec sur la MR | Pastille danger + commentaire automatique, pas de transition |
| MR fusionnée avec `Fixes` | → « Résolu » ; champ « Version corrigée » renseigné au prochain tag |
| Déploiement en production réussi | → « Livré » avec date et environnement |
| MR fermée sans fusion | Retour à l'état précédent |
| Commit `Reverts` ou revert de la MR | Réouverture avec lien vers le revert |
- Les transitions passent par les **validateurs du workflow** ; un refus produit un commentaire explicatif, jamais un contournement.
- Garde anti-boucle : un changement déclenché par GitLab ne redéclenche pas d'action vers GitLab.

### 17.6 Suivi spécifique des corrections de bugs
- Champs sémantiques proposés dans le gabarit « Bug » : version affectée, version corrigée, commit de correction, commit introducteur (si connu), cause racine, régression de.
- **Rétroportages** : détection des cherry-picks (`-x`) et tableau « branche de maintenance → état » par bug ; un bug n'est « Livré » que lorsque toutes les branches ciblées sont traitées.
- **Règle optionnelle de non-régression** : avertissement si la MR liée à un bug ne modifie aucun fichier de test.
- **Notes de version** générées depuis les tickets fusionnés entre deux tags.

### 17.7 Suivi des tâches de développement et indicateurs
- Avancement dérivé des MR et des listes de contrôle liées.
- Mesures : délai de cycle (premier commit → fusion → déploiement), temps d'attente de revue, MR sans relecteur depuis N jours (alerte).
- **Widgets DORA** : fréquence de déploiement, délai de mise en production, taux d'échec des changements, temps de restauration.

### 17.8 Cohérence et outillage côté développeurs
- Gabarit de job CI `athena-check` (et crochet `commit-msg` optionnel) : vérifie que chaque commit ou MR vers une branche protégée référence un artefact valide.
- CLI `athena` : `athena branch BUG-142` (crée la branche au bon nom), ajout automatique de la clé au message depuis le nom de branche.
- Protection : seules les branches et MR créées via Athena sont des écritures de sa part ; aucune écriture sur les branches protégées.

### 17.9 Sécurité spécifique
- Contenu des commits, MR et noms de branches traité comme **non fiable** (échappement, longueurs bornées).
- Secret de webhook en temps constant, rotation via OpenBao ; signature des appels sortants vers GitLab.
- Moindre privilège sur les jetons ; journalisation de toute action d'écriture vers GitLab avec l'acteur Athena.
- Défense contre l'usurpation : un message de commit ne peut pas, à lui seul, faire passer un ticket à un état interdit à son auteur.

### 17.10 Livraison et critères d'acceptation
- Livré sous forme de **plugin connecteur** `athena-gitlab-code` (sur l'API de plugin, § 6) : lot 1 (références + panneau en lecture, fin de phase 3), lot 2 (transitions, création de branche/MR, rétroportages, DORA, phase 7).
- Une correction suivie de bout en bout (branche → MR → fusion → déploiement) fait évoluer le bug en moins de 10 s par étape, sans intervention manuelle.
- Zéro transition accordée à un auteur sans droit ; reprise correcte après coupure de webhooks de 1 h (réconciliation).

---

## 18. Interface moderne et intuitive

### 18.1 Cadre
La modernité est obtenue par la **qualité d'interaction, la clarté et la rapidité**, dans le cadre de la charte Hemeria (angles droits, aplats, pas d'ombre ni de dégradé, bleu « action » seul). Les codes visuels courants des produits « modernes » (coins arrondis, ombres, flous, dégradés) sont **exclus par la charte** : à confirmer que ce compromis convient.
Le thème sombre n'existe pas dans Hemeria ; il peut être dérivé des rampes tonales de `DESIGN.json` mais constitue une **extension à valider par le design** (décision § 23.1).

### 18.2 Principes d'ergonomie
1. **Rapidité perçue** : interactions < 100 ms, mises à jour optimistes, squelettes plutôt que roues d'attente, listes virtualisées.
2. **Clavier d'abord** : palette de commandes ⌘K (recherche et actions), raccourcis cohérents, ordre de tabulation logique, focus toujours visible.
3. **Édition en place** : pas de page « modifier » ; enregistrement automatique avec « Annuler » (toute modification est un commit : annuler = restaurer la révision).
4. **Divulgation progressive** : création minimale (type + titre), champs avancés repliés, mode simple par défaut, mode expert (ATQL) en option, **constructeur visuel de filtres** synchronisé avec l'ATQL.
5. **Cohérence** : quatre gabarits d'écran seulement (liste, détail, board, configuration), mêmes verbes partout, mêmes emplacements pour les actions.
6. **Découvrabilité** : états vides utiles (modèle Hemeria), aide contextuelle, parcours de première connexion avec projet de démonstration, liste de contrôle d'amorçage.
7. **Prévention des erreurs** : confirmation seulement pour l'irréversible, aperçu d'impact avant migration de tracker, validation en ligne avec messages précis et sobres.
8. **Retour d'état** : synchronisation Git, livraison des webhooks, import en cours, toujours visibles et non bloquants.
9. **Navigation** : barre latérale par projet, fil d'Ariane, récents et favoris, **URL profondes partageables** pour chaque vue et chaque filtre.
10. **Personnalisation** : vues enregistrées, colonnes, densité (compacte/confortable), langue, thème.
11. **Configuration guidée** : assistant de création de tracker, glisser-déposer des champs, **aperçu en direct** du formulaire, modèles prêts à l'emploi.
12. **Accessibilité et adaptation** : WCAG 2.1 AA, respect de `prefers-reduced-motion`, usage tablette, tiroir mobile sous 768 px.

### 18.3 Méthode
- Recherche utilisateur en phase 0 (entretiens, parcours de 5 personas).
- Pour chaque écran majeur : maquette → **prototype cliquable testé** → développement → test d'usage en recette.
- Tests avec 5 utilisateurs par cycle, tâches chronométrées, observation des blocages.
- Revue heuristique (Nielsen) à chaque phase d'interface ; tests axe et captures de régression visuelle en CI.
- Télémétrie d'usage **optionnelle, anonymisée, désactivable** pour repérer les frictions (jamais de contenu d'artefact).

### 18.4 Indicateurs et critères d'acceptation
| Parcours | Cible |
|---|---|
| Créer un ticket | < 20 s, sans formation |
| Retrouver un ticket par ⌘K | < 5 s |
| Déplacer une carte au clavier | possible, annoncé aux lecteurs d'écran |
| Configurer un nouveau tracker depuis un gabarit | < 10 min, sans documentation |
| Score d'utilisabilité SUS | ≥ 80 |
| Taux de réussite des tâches de test | ≥ 90 % |
| Zéro écart détecté au lint design | 100 % des écrans |

---

## 19. Continuité du développement avec un agent IA (limites de contexte)

### 19.1 Problème
Une session d'agent IA a une **fenêtre de contexte finie**. Les sessions successives ne partagent rien, sauf ce qui est écrit dans des fichiers ; les résumés automatiques perdent des détails ; lire de gros fichiers ou de longs journaux consomme le contexte utile. Le plan suppose qu'une part importante du code est produite par des sessions d'agent : l'état du projet doit donc vivre **dans le dépôt**, pas dans la conversation.

### 19.1 bis Outil et modèle de développement
Le développement est réalisé avec **Claude Code** et le modèle **Sonnet 5.5**. Le protocole ci-dessous s'applique à cet outil. L'infrastructure de développement temporaire (PostgreSQL, Redis, MinIO, Keycloak, OpenBao) est décrite dans `deploy/dev/README.md` et démarre avec `docker compose up -d`.

### 19.2 Principes
1. **Le dépôt est la mémoire** : tout ce qu'il faut pour reprendre est un fichier versionné, court et tenu à jour.
2. **Tâches taillées pour une session** : une tâche = une tranche verticale terminable et vérifiable (repère : ≤ 5 fichiers, ≈ 400 lignes modifiées, un critère d'acceptation principal). Toute tâche plus grosse est découpée *avant* de commencer.
3. **Les tests sont la mémoire exécutable** : critères d'acceptation écrits sous forme de tests au début de la tâche ; reprendre = lancer la suite et lire ce qui échoue.
4. **Architecture lisible par morceaux** : paquets petits, fichiers < 400 lignes, interfaces publiques explicites, README court par paquet (rôle, API, invariants, commandes), conventions strictes pour que le code soit prévisible.
5. **Lecture ciblée** : carte du dépôt générée, recherche avant lecture, jamais de lecture complète des fichiers volumineux, des lockfiles ou des journaux ; sorties de commandes résumées par des scripts (`pnpm check:summary`).
6. **Une décision écrite vaut mieux qu'une décision retrouvée** : toute décision d'architecture a une ADR courte.
7. **Réutiliser avant de créer** : chercher l'existant (carte du dépôt, index des symboles) avant d'ajouter un utilitaire, pour éviter les doublons dus à une vue partielle.

### 19.3 Fichiers de continuité
```
CLAUDE.md / AGENTS.md            # < 150 lignes : règles, commandes, interdits, pointeurs
docs/dev/STATE.md                # état courant (≤ 1 page) : phase, tâche en cours, prochain pas, blocages
docs/dev/DECISIONS/ADR-0001.md   # décisions et raisons
docs/dev/GLOSSAIRE.md            # vocabulaire du domaine
docs/dev/REPO_MAP.md             # généré : arborescence commentée, modules, points d'entrée
docs/dev/tasks/T-0001/
   TASK.md                       # objectif, critères d'acceptation, fichiers concernés, hors périmètre
   CONTEXT.md                    # journal : fait / reste / pièges / commandes utiles
```
Même convention que `developer/tasks/<id>/Context.md` dans StrictDoc, afin de rester homogène avec vos autres dépôts.

### 19.4 Protocole de session
**Au début**
1. Lire `CLAUDE.md`, `STATE.md`, puis `CONTEXT.md` de la tâche en cours.
2. `git status`, `git log -5`, lancer les tests ciblés de la tâche.
3. Énoncer un plan court avant de coder.

**Pendant**
- Un commit à chaque sous-étape verte ; `CONTEXT.md` mis à jour à chaque décision ou piège rencontré.
- Recherches volumineuses confiées à un sous-agent qui rend une synthèse courte.
- Un sujet par session ; tâche transverse précédée d'un *spike* qui produit une note d'une page.

**À la fin (ou dès que le contexte approche 70 %)**
1. Ramener le dépôt à un état stable (tests verts) ou isoler clairement le travail en cours.
2. Commiter (auteur unique, § 13.4).
3. Mettre à jour `CONTEXT.md` et `STATE.md` : fait, reste, prochaine commande, fichiers clés, pièges.
4. Écrire le **prompt de reprise** : « Reprends T-00xx. Lis `docs/dev/STATE.md` puis `docs/dev/tasks/T-00xx/CONTEXT.md`, lance `pnpm test --filter …`, continue à l'étape suivante. »

### 19.5 Gestion du budget de contexte
- `CLAUDE.md` court et pointant vers les détails, jamais un manuel.
- Sorties limitées (`--reporter=dot`, `| head`), pas de collage de journaux entiers.
- Refactorisations de masse par *codemods* scriptés plutôt que modifications manuelles.
- Code répétitif généré (clients d'API depuis OpenAPI, tokens depuis `DESIGN.json`).
- Gabarits de paquet, de module de tracker, de plugin et de test pour réduire ce qu'il faut redécouvrir.

### 19.6 Athena au service de son propre développement
- **Avant le MVP** (phases 0 à 3) : backlog dans `docs/dev/tasks/` et exigences d'Athena en `.sdoc` (UID, marqueurs `@relation` dans le code), cohérent avec § 16.
- **Dès le MVP** : le backlog migre dans Athena (une tâche = un artefact, critères d'acceptation en champ structuré). Un **serveur MCP / CLI `athena`** permet à l'agent de lire sa tâche, son état et ses critères, d'y consigner l'avancement et de commenter ; l'historique Git conserve le tout.
- Les fichiers `STATE.md` et `ROADMAP-STATUS.md` sont alors **générés** depuis Athena, ce qui limite les dérives.

### 19.7 Garde-fous
- **CI complète = filet de sécurité** quand la session change : tests, lint, lint design, scans de sécurité.
- Contrôle CI : une PR qui modifie du code sans mettre à jour `CONTEXT.md` de la tâche déclenche un avertissement.
- *Definition of Ready* d'une tâche : critères d'acceptation clairs, dépendances connues, taille d'une session.
- *Definition of Done* : tests, documentation courte, `STATE.md` à jour, ADR si décision.
- Revue humaine à chaque jalon et security gate (§ 13.1).

### 19.8 Impact sur le plan
- Chaque phase est découpée en **tâches de taille session** (ordre de grandeur : 40 à 60 pour la phase 2). La capacité réelle (tâches terminées par semaine) est mesurée en phase 1 et sert à recaler les durées.
- La mise en place de ce dispositif est un livrable de la **phase 0**.

### 19.9 Risques propres à cette approche
| Risque | Parade |
|---|---|
| `STATE.md` périmé | Génération automatique, contrôle CI, vérification au début de chaque session |
| Décisions perdues | ADR obligatoires, revue aux jalons |
| Tâches trop grosses | Definition of Ready, découpage préalable |
| Doublons de code, styles divergents | Carte du dépôt, règle « chercher avant de créer », lint et formateurs, gabarits |
| Dérive de périmètre au fil des sessions | `TASK.md` avec « hors périmètre » explicite |
| Dépendance à un seul outil d'agent | Fichiers de continuité indépendants de l'outil (Markdown, scripts) |

---

## 20. Feuille de route par phases

Durées indicatives pour l'équipe ci-dessus ; à recaler après la phase 0.

### Phase 0 — Cadrage et fondations (4 semaines)
**Objectif** : lever les incertitudes majeures avant de coder le produit.
- Ateliers utilisateurs, backlog initial priorisé (MoSCoW), glossaire.
- ADRs : stack, modèle Git, isolation des plugins, multi-tenance.
- **Spikes** :
  1. Écriture/lecture massive dans GitLab (débit de commits, taille de dépôt, latence) — critère : 20 commits/s soutenus sur un dépôt de 1 M fichiers ou stratégie de sharding définie.
  2. Sandbox de plugins serveur (isolated-vm vs processus) — mesure d'isolation et de coût.
  3. Compilation ATQL → SQL sur 1 M de lignes JSONB.
  4. Signature de commits Git par utilisateur via Transit d'OpenBao (format SSH), et reconnaissance par GitLab.
  5. Lecture et indexation d'un dépôt StrictDoc (export ou analyse des `.sdoc`), mesure des temps.
- Modèle de menaces initial (STRIDE) et déploiement de Keycloak et OpenBao en environnement de dev.
- Mise en place de la règle d'auteur unique pour les commits de développement (hooks, contrôle CI, signature) dès le premier commit.
- Monorepo, CI, environnement de dev, conventions.
- **Dispositif de continuité pour l'agent IA** (§ 19) : `CLAUDE.md`/`AGENTS.md`, `STATE.md`, modèles `TASK.md` / `CONTEXT.md`, script de carte du dépôt, premiers ADR, découpage de la phase 1 en tâches de taille session.
- **Recherche utilisateur** et premiers prototypes cliquables (§ 18.3).
- Schéma de raccordement des dépôts de code GitLab et conventions de références (§ 17.3).
- **Livrables** : architecture validée, prototype GitLab, maquettes basse fidélité des écrans clés, plan de risques.
- **Sortie de phase** : revue d'architecture, go/no-go.

### Phase 1 — Socle plateforme et design system (6 semaines)
- **Keycloak** : realm(s), clients, BFF avec session `HttpOnly`, validation JWT, mapping groupes/rôles, thème Hemeria, MFA administrateur (§ 14.1).
- **OpenBao** : politiques par service, KV, identifiants PostgreSQL dynamiques, Transit, audit (§ 14.2) ; bibliothèque interne `@athena/secrets`.
- Utilisateurs, groupes, rôles, organisations/projets, audit log chaîné par hachage, RLS PostgreSQL.
- Pipeline de sécurité complet (§ 13.2) actif dès le premier jour ; premier **security gate**.
- Squelette API (OpenAPI), erreurs normalisées, rate limiting, versionnage.
- **`@athena/ui`** : génération des tokens depuis `DESIGN.json`, composants de base, Storybook, lint design, thème.
- Shell applicatif : `Sidebar` (logo `ATHENA·` avec point rouge), `PageHeader`, navigation, i18n, `Toast`, `Modal`.
- Outbox + bus d'événements interne.
- **Critères d'acceptation** : connexion SSO, création de projet, 100 % des composants documentés et conformes aux règles Hemeria, tests axe verts.

### Phase 2 — Noyau trackers et artefacts (8 semaines)
- Définition de tracker : types de champs de base (texte, riche, nombre, date, liste, multi-liste, utilisateur, case, lien, calculé simple, pièce jointe).
- CRUD artefacts avec validation par schéma, numérotation `KEY-n`, commentaires Markdown, pièces jointes, mentions, watchers.
- Liens typés entre artefacts et hiérarchie ; types de liens configurables.
- Workflow : statuts, transitions, conditions et validateurs natifs, permissions par transition.
- Permissions par rôle, par champ, par tracker.
- UI : liste dense, vue artefact, éditeur de tracker, éditeur de workflow (v1 formulaire, v2 graphique).
- Historique en base (révisions) en attendant GitLab.
- **Critères d'acceptation** : un administrateur configure un tracker « Bug » et un tracker « Exigence » sans développement, avec workflow et permissions ; 10 000 artefacts affichés < 1 s.

### Phase 3 — Historique GitLab (6 semaines)
- Module `gitlab-sync` : sérialisation YAML déterministe, commits atomiques, mapping d'auteur, regroupement de commits.
- Gestion d'échec : retry, DLQ, indicateur de retard, réconciliation.
- Onglet Historique (liste de commits, diff, restauration), baselines (tags), comparaison.
- Synchronisation inverse : webhook GitLab, validation, détection de conflits, mode « merge request obligatoire ».
- Commande `rebuild --from-git` + test de reconstruction complète.
- Chiffrement des champs confidentiels via Transit d'OpenBao ; analyse anti-secrets avant commit.
- Auteur = utilisateur réel, committer = service, signature selon la décision du spike (§ 13.4) ; contrôle de cohérence avec `Athena-Actor`.
- **Lot 1 du connecteur GitLab de code** (§ 17), avancé ici pour le MVP : références de clés dans commits/MR/branches, panneau « Développement » en lecture seule, rattrapage initial (+2 à 3 semaines, phase 3 portée à 8–9 semaines).
- Pentest interne et security gate de fin de phase.
- **Critères d'acceptation** : chaque modification produit un commit traçable en moins de 5 s p95 ; reconstruction d'une base de 100 000 artefacts depuis Git identique à l'originale (hash de comparaison) ; coupure GitLab de 30 min sans perte d'événement.

### Phase 4 — Recherche, ATQL et rapports (5 semaines)
- Grammaire ATQL, compilateur, autocomplétion, filtres sauvegardés et partagés.
- Recherche plein texte (FTS), index GIN, colonnes générées.
- Rapports de tracker (tables agrégées), export CSV/Excel/PDF.
- Vues sauvegardées et colonnes configurables.
- Commande `⌘K` globale (artefacts, projets, actions).
- **Critères d'acceptation** : suite de 200 requêtes de référence ; p95 < 500 ms sur 1 M d'artefacts.

### Phase 5 — Agile et pilotage (6 semaines)
- Boards Kanban (colonnes ↔ statuts, WIP, swimlanes), Scrum (sprints, backlog, estimation, capacité).
- Releases, epics, roadmap/timeline, burndown/burnup, vélocité, diagramme de flux cumulé.
- Dashboards avec widgets (système de widgets natif, déjà sur l'API plugin), `StatCard` en composition asymétrique.
- Tests d'usage des boards et du backlog (§ 18.3).
- **Critères d'acceptation** : un Scrum master pilote un sprint complet (planification → revue) ; board fluide à 500 cartes.

### Phase 6 — Plugins (7 semaines)
- Runtime serveur sandboxé, chargeur client, permissions, signature, cycle de vie, stockage.
- Points d'extension : `fieldType`, `view`, `dashboardWidget`, `workflowAction`, `connector`, `artifactTab`, `apiRoute`.
- `@athena/plugin-sdk`, `create-athena-plugin`, mode dev à chaud, documentation.
- Migration des fonctionnalités embarquées (GitLab, types de champs avancés) vers l'API de plugin (« dogfooding »).
- 3 plugins de référence + plugin **Traçabilité** (matrice, liens suspects).
- Revue de sécurité dédiée (évasion de sandbox, exfiltration, DoS).
- **Critères d'acceptation** : un plugin tiers installable, mis à jour et désinstallé sans redémarrer ; un plugin hostile de test ne peut ni lire la base, ni dépasser ses quotas, ni appeler un hôte non autorisé.

### Phase 6 bis — Documentation StrictDoc (3 semaines)
- Plugin `athena-strictdoc` : configuration des sources, indexation en conteneur isolé, rafraîchissement sur push GitLab.
- Type de champ `sdocRef`, type de lien « documenté par », onglet « Documentation liée », recherche ⌘K.
- Liens suspects par hash, rapport et widget de couverture, baselines couplées.
- Report des références dans le `.sdoc` par merge request ; API `doc-links`.
- Documentation d'Athena rédigée en `.sdoc` avec UID.
- **Critères d'acceptation** : voir § 16.5. Security gate : analyse des `.sdoc` en environnement cloisonné, fuzzing du lecteur.

### Phase 7 — Webhooks, automatisations et suivi du développement (7 semaines)
- Webhooks sortants (abonnements, filtres ATQL, HMAC, retries, DLQ, journal, rejeu, test).
- Webhooks entrants (sources, mappeurs JSONata, idempotence).
- Moteur d'automatisation « quand / si / alors » (déclencheurs : événements, planifié ; actions : modifier, transitionner, commenter, notifier, webhook, action plugin) avec garde anti-boucle.
- **Lot 2 du connecteur GitLab de code** (§ 17) : transitions automatiques selon le tableau § 17.5, création de branche/MR, rétroportages, notes de version, widgets DORA, gabarit CI `athena-check`, CLI `athena`.
- Sécurité : tests d'usurpation d'auteur et de contournement de workflow par message de commit.
- Notifications : e-mail, digest, in-app ; canaux via plugins.
- **Critères d'acceptation** : 1 000 livraisons/min sans perte ; protection SSRF validée par pentest ; aucune boucle d'automatisation infinie possible.

### Phase 8 — Migration, durcissement et lancement (6 semaines)
- Importeurs JIRA (CSV/API) et Tuleap (API/export) en plugins, avec prévisualisation et rapport d'écarts.
- Performance (k6), tuning, cache, tests de charge cibles.
- Sécurité : pentest externe, correction, SBOM, durcissement des images.
- Observabilité, runbooks, PRA, sauvegardes testées.
- Documentation (utilisateur, admin, API, plugin), formation, données de démonstration.
- Bêta fermée avec 2 équipes pilotes, puis GA 1.0.
- **Critères d'acceptation** : tous les SLO atteints sur 2 semaines en pré-production ; zéro vulnérabilité critique ou haute ouverte.

### Après la v1
- v1.1 : PWA/mobile, recherche OpenSearch, SLA/files de service, formulaires publics.
- v1.2 : plugin Gestion de tests, signatures électroniques, exports ReqIF.
- v2.0 : marketplace, multi-organisation SaaS, GraphQL en écriture, IA (résumés, classification, doublons) via plugins.

### Synthèse du calendrier
| Phase | Durée | Cumul |
|---|---|---|
| 0 Cadrage | 4 sem. | 4 |
| 1 Socle + design system | 6 | 10 |
| 2 Trackers & artefacts | 8 | 18 |
| 3 Historique GitLab + lot 1 GitLab de code | 8–9 | 27 |
| 4 ATQL & rapports | 5 | 32 |
| 5 Agile | 6 | 38 |
| 6 Plugins | 7 | 45 |
| 6 bis Documentation StrictDoc | 3 | 48 |
| 7 Webhooks, automatisations & suivi du développement | 7 | 55 |
| 8 Migration & lancement | 6 | 61 |

Chevauchements possibles (4 ∥ 5, 6 ∥ 7 partiel) : **≈ 50–54 semaines** jusqu'à la GA. Une **MVP interne** (phases 0–3 + liste/board simples) est atteignable vers la semaine 27 (avec le lot 1 du connecteur GitLab de code).

---

## 21. Jalons et critères de sortie

| Jalon | Semaine | Preuve |
|---|---|---|
| M0 — Architecture validée | 4 | ADRs, spikes concluants |
| M1 — Design system publié | 10 | Storybook, lint design, a11y |
| M2 — Trackers configurables | 18 | Démo : tracker Bug + Exigence en configuration pure |
| M3 — Historique Git opérationnel + lot 1 GitLab de code | 27 | **MVP interne** ; reconstruction depuis Git |
| M4 — Pilotage complet | 38 | Sprint réel piloté |
| M5 — Écosystème ouvert | 55 | Plugin tiers, liaison StrictDoc, suivi GitLab bout en bout et webhooks en production pilote |
| M6 — GA 1.0 | ~61 (ou 50–54 avec chevauchements) | SLO, pentest externe, doc, formation |

---

## 22. Registre des risques

| # | Risque | Probabilité | Impact | Parade |
|---|---|---|---|---|
| R1 | Débit/latence GitLab insuffisants pour l'historique | Élevée | Élevé | Spike phase 0, commits groupés, sharding, écriture asynchrone |
| R2 | Sandbox de plugins contournable | Moyenne | Critique | Isolation processus + quotas, revue sécurité, plugins signés, mode « plugins de confiance » |
| R3 | Dérive de périmètre (JIRA + Tuleap = très large) | Élevée | Élevé | Backlog MoSCoW, MVP phase 3, plugins pour le long tail |
| R4 | Complexité du schéma configurable (migrations de trackers) | Moyenne | Élevé | Versionnage de schéma, dry-run, tests de migration |
| R5 | Performance JSONB à grande échelle | Moyenne | Moyen | Colonnes générées, index ciblés, tests de charge précoces |
| R6 | Boucles d'automatisation / tempêtes de webhooks | Moyenne | Moyen | Profondeur max, limites de débit, disjoncteurs |
| R7 | Écart entre Hemeria (outil de référence) et besoins boards/Gantt | Moyenne | Moyen | Extensions documentées et validées par le design, mêmes règles |
| R8 | Données sensibles dans Git | Moyenne | Élevé | Chiffrement des champs confidentiels, dépôts privés, revue RGPD |
| R9 | Adoption / migration depuis JIRA/Tuleap | Moyenne | Élevé | Importeurs, pilotes, formation, mode coexistence |
| R10 | Dépendance à une seule personne sur le sandbox/Git | Moyenne | Moyen | Pair programming, documentation, ADRs |

---

## 23. Décisions

### 23.1 Décisions prises (2026-10-31)
| # | Sujet | Décision | Conséquence sur le plan |
|---|---|---|---|
| 1 | Backend | **Node 22 + NestJS + TypeScript** | Types partagés avec le front et `@athena/ui` |
| 2 | Dépôts d'historique | **Un dépôt GitLab par projet Athena** | Droits et volumétrie isolés par projet |
| 3 | Keycloak | **Un realm unique, groupes par organisation** | Pas de multi-realm en v1 ; isolation par groupes et RLS |
| 4 | Signature des commits d'historique | **Signature unique par le service** + trailer `Athena-Actor` et audit chaîné | Auteur = utilisateur réel ; l'option par utilisateur via Transit est reportée (le spike de phase 0 est réduit à une étude de faisabilité) |
| 5 | Thème | **Clair uniquement, strictement Hemeria** | Thème sombre hors v1 |
| 6 | MVP interne | **Phases 0 à 3 + lot 1 du connecteur GitLab de code** | Lot 1 avancé de la phase 5 à la fin de la phase 3 (+2 à 3 semaines) : MVP vers la **semaine 27** |
| 7 | Langues | **Français + anglais** | Clés de traduction dès la phase 1 |
| 8 | Hébergement | (remplacé par la ligne 12) | `docker-compose` conservé pour le développement local |
| 9 | Auteur des commits de développement | `Laurent Carcagno <laurent.carcagno@gmail.com>` | § 13.4 |
| 10 | Keycloak et OpenBao | Retenus pour l'identité et les secrets | § 14 |
| 11 | GitLab | **Instance interne existante** | Pas de déploiement GitLab ; version, quotas et runners à relever en phase 0 |
| 12 | Hébergement | **Kubernetes sur site** | Helm chart, authentification Kubernetes d'OpenBao, HA (remplace la ligne 8) |
| 13 | Fédération Keycloak | **LDAP / Active Directory + comptes locaux** | Fédération LDAP en phase 1 ; comptes locaux pour les cas hors annuaire |
| 14 | MFA | **Administrateurs seulement** au départ | Politique extensible à tous les utilisateurs |
| 15 | OpenBao | **Instance existante réutilisée** | Création des chemins `athena/…`, politiques et rôles Kubernetes ; pas de déploiement OpenBao |
| 16 | Pièces jointes | **S3 / MinIO**, hash SHA-256 dans le YAML | Dépôts Git légers |
| 17 | StrictDoc | **Dépôt déjà sur GitLab** | Indexation directe par webhook en phase 6 bis |
| 18 | Conformité | **Traçabilité standard** | Pas d'exigence réglementaire en v1 ; ReqIF et signature par utilisateur restent en option ultérieure |

### 23.2 Points ouverts : réponses retenues par défaut
Ces réponses sont des valeurs par défaut proposées par le rédacteur du plan. Elles sont révisables sans impact majeur sur le calendrier, sauf mention contraire.

1. **Marque** : logo « ATHENA·BOARD » sur le modèle `THOR·ENGINE`, avec le point séparateur en Tricolor Red (seul usage du rouge dans la barre latérale) et le sous-titre en capitales à 45 % d'opacité. Une validation visuelle par le design Hemeria reste requise avant la phase 1.
2. **Dépôts de code GitLab** : conventions par défaut, entièrement configurables par projet :
   - un dépôt de code au démarrage, extensible à N ;
   - branche principale `main`, branches de maintenance `release/<x.y>` ;
   - branches de travail `bugfix/<CLÉ>-<résumé>` et `feature/<CLÉ>-<résumé>` ;
   - mots-clés : `Refs`, `Fixes`, `Closes`, `Implements`, `Reverts` ;
   - environnements : `dev`, `recette`, `production`.
   Le relevé des conventions réellement en usage dans vos dépôts se fait en phase 0 et remplace ces valeurs.
3. **Agent IA** : développement avec Claude Code et le modèle Sonnet 5.5. La taille de fenêtre de contexte n'est pas connue du rédacteur : le protocole retient donc une hypothèse prudente (budget de travail inférieur à la fenêtre, clôture de session dès ~70 % consommés) et reste valable si la fenêtre est plus grande. Le protocole et les fichiers de continuité du § 19 sont adoptés tels quels.
4. **Interface** : le compromis du § 18.1 est adopté : modernité par l'interaction (clavier, édition en place, rapidité, annulation, assistants), dans la charte Hemeria sans exception, thème clair seul.
5. **StrictDoc** (vérifié dans `C:\projects\AI\STRICTDOC`) :
   - version **0.30.2** ;
   - export **JSON** disponible (`strictdoc export … --formats=json`), ainsi que ReqIF, RST, Excel, SPDX ; l'export JSON **n'inclut pas** les documents composés (`[LINK: UG_COMPOSABLE_DOCUMENTS]`) : l'indexeur lit donc aussi les `.sdoc` directement ou via l'API Python de StrictDoc ;
   - champs personnalisés dans `[GRAMMAR]` (type `String`, etc.) : le champ de références Athena est **`ATHENA_REFS`** (type String, clés séparées par des virgules) ;
   - aucune modification de StrictDoc n'est requise en v1 ; toute évolution côté StrictDoc suit ses règles (`AGENTS.md`, accord préalable).
6. **Relevés d'environnement en phase 0** (non accessibles depuis ce poste, donc non renseignés ici) :
   - GitLab : version (`/api/v4/version`), quotas de dépôt, runners disponibles, limites d'API, existence de règles de push ;
   - OpenBao : version, moteurs activés (KV v2, Transit, database, PKI), méthode d'authentification Kubernetes, espace de noms et politique de nommage ;
   - LDAP/AD : schéma, attribut de connexion, groupes, e-mail vérifié, volumétrie ;
   - Kubernetes : version, classe de stockage, ingress, politique réseau, registre d'images.

---

## 24. Prochaines étapes immédiates (2 semaines)

1. Valider ce plan et trancher les décisions ouvertes les plus structurantes (§ 23.2 : 2, 3, 5, 6).
2. Lancer les trois spikes de la phase 0 (GitLab, sandbox plugin, ATQL/JSONB).
3. Initialiser le monorepo et la CI.
4. Générer les tokens depuis `DESIGN.json` et poser la première version de `@athena/ui` (Btn, StatusPill, PageHeader, Table).
5. Organiser les ateliers utilisateurs pour consolider le backlog MVP.

---

## 25. État d'implémentation (2026-10-31)

Légende : ● fait et testé · ◐ partiel · ○ non fait.

| Phase / sujet | État | Remarques |
|---|---|---|
| 0 Cadrage, dispositif de continuité agent | ● | `CLAUDE.md`, `docs/dev/STATE.md`, fiches de tâches, ADR |
| 1 Socle : Keycloak (BFF, PKCE, sessions, back-channel), OpenBao (KV, Transit, secret de session), RLS, audit chaîné, design system, CI | ● | thème sombre hors v1 |
| 2 Trackers multiples configurables, workflow, liens, commentaires, API REST | ● | pièces jointes (API) et permissions par champ : ●; interface d'envoi et quotas : ●; modification et suppression de champs (API et interface) : ●; antivirus (ClamAV, optionnel) : ● |
| 3 Historique GitLab (commits par auteur réel, tracker.yaml, restauration, baselines, synchronisation inverse, rebuild) | ● | signature des commits : par l'instance GitLab (configuration), pas par utilisateur ; MR obligatoire : configuration GitLab |
| 4 ATQL et recherche | ● | plein texte : ●; filtres enregistrés et autocomplétion : ● |
| 5 Boards, sprints, burndown, vélocité, flux, roadmap, tableau de bord | ● | swimlanes et Gantt des versions : ● |
| 6 Plugins (signature, isolation, SDK, CLI, hooks, administration) | ◐ | types de champ, hooks, actions, widgets (API), désinstallation avec politique de données : ● ; rendu des widgets dans le tableau de bord : ● ; vues, connecteurs : ○ |
| 6 bis Liaison StrictDoc (index, liens suspects, couverture, récupération GitLab) | ● | écriture des références dans le `.sdoc` par MR : ○ |
| 7 Webhooks sortants et entrants, automatisations, connecteur GitLab de code (références, transitions, branche, MR) | ◐ | rétroportages, DORA, notes de version, CLI `athena`, job CI `athena-check` : ●; déclencheurs planifiés : ● |
| 8 Import JIRA/Tuleap, performance, sécurité interne, conteneurs et Helm, documentation | ◐ | **test d'intrusion externe : à commander** ; charge concurrente et déploiement réel sur Kubernetes : non mesurés ; formation : ○ |
| Interface (liste, fiche, board, création, éditeur de tracker, administration, tableau de bord, palette, FR/EN) | ● | tests de bout en bout (Playwright, Keycloak réel) et accessibilité (axe-core, contraste inclus) : ● ; Storybook : ○ |

Chiffres au 2026-10-31 : 262 tests API, 30 UI, 27 web, 4 SDK (tous verts) ; aucune vulnérabilité de dépendance connue ; 100 000 artefacts, p95 de recherche sous 300 ms.
