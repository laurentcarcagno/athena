# ADR-0002 : évolution du prototype vers l'IHM cible

Statut : accepté avec les réponses du 2026-11-06 (§ 7), question 4 en attente. Source : `docs/dev/SPEC_IHM.md`. Tâches : T-0048 à T-0096, section « Reprise IHM » de `docs/dev/STATE.md`.

## 1. Décisions prises le 2026-11-06

1. **Clés d'item** : `<PROJET>-<TRACKER>-<n sur 4 chiffres minimum>`, par exemple `SAT1-REQ-0042`, uniques dans l'organisation.
2. **Documents d'exigences** : StrictDoc reste la source. Athena affiche les documents en lecture seule ; toute exigence d'un document peut être citée dans un artefact.
3. **Niveau de protection** : l'instance principale ne traite que des données non protégées. Un projet défense dispose d'une instance Athena distincte, servie sur le réseau DR par un système homologué, sans accès Internet.

Conséquence de 3 : le marquage (Lot 4) est un paramètre de **déploiement** (une instance = un niveau), pas une donnée par organisation. Aucune donnée protégée n'est traitée par l'instance principale, qui n'a donc pas à faire respecter la séparation.

## 2. Clés d'item (Lot 0)

### État actuel
Clé = `<CLÉ_TRACKER>-<n>` (`artifact.service.ts:58`), unique par projet (`unique (project_id, key)`, migration 002). Deux projets peuvent donc avoir `REQ-42`. La clé est écrite dans le chemin Git (`trackers/REQ/artifacts/REQ-42.yaml`), les messages de commit, les références de commits et de branches, l'ATQL, `ATHENA_REFS`, les imports, la CLI.

### Choix
- La clé est **stockée**, calculée une fois à la création : `project.key || '-' || tracker.key || '-' || lpad(number, 4, '0')`. Elle ne change pas si un nom change. Au-delà de 9999 elle prend simplement un chiffre de plus.
- Unicité : `unique (organization_id, key)` ajoutée. Elle est automatiquement satisfaite, la clé de projet étant déjà unique dans l'organisation.
- **Alias** : table `artifact_key_alias (organization_id, artifact_id, project_id, alias)`, unique `(project_id, alias)`. Les anciennes clés ne sont uniques que dans leur projet : un alias se résout donc toujours **dans le contexte d'un projet** (URL `/p/:projet/...`, dépôt Git du projet, webhook d'un projet, requête ATQL d'un projet). Une ancienne clé citée sans contexte de projet n'est pas résolue. Une clé à trois segments n'entre jamais en collision avec un alias à deux segments.
- **Résolution centralisée** par la fonction SQL `resolve_artifact(project, key)` (clé canonique d'abord, alias ensuite). Une quinzaine de requêtes comparent aujourd'hui `a.key = $n` directement (`artifact`, `link`, `doc-link`, `sprint`, `report`, `board`, `attachment`, `gitcode`, `delivery`, `reverse-sync`, contrôleur) : elles sont migrées vers cette fonction dans T-0049/T-0050, avec un test qui échoue si une requête compare encore la clé brute.
- **Expressions régulières** : la clé canonique `[A-Z][A-Z0-9]{1,9}-[A-Z][A-Z0-9]{1,9}-\d{4,9}` est testée **avant** la forme ancienne `[A-Z][A-Z0-9]{1,9}-\d{1,9}`, et la forme ancienne n'est pas cherchée à l'intérieur d'une clé canonique (sinon `REQ-0042` serait extrait de `SAT1-REQ-0042`). Trois définitions dispersées aujourd'hui (`refs.ts`, `sdoc-parser.ts`, `inbound.service.ts`, `reverse-sync.ts`, `code-actions.ts`, CLI) sont regroupées dans `core/key.ts`.
- **Historique GitLab** : chemin `trackers/REQ/artifacts/SAT1-REQ-0042.yaml` (le dossier reste le tracker), YAML avec `aliases: [REQ-42]`. Un commit unique par projet (« migration des clés ») renomme les fichiers : Git suit les renommages, l'historique de chaque fichier est conservé. Les anciens commits ne sont pas réécrits. La reconstruction et la synchronisation inverse acceptent les deux chemins.
- **URL** : `/p/:projet/a/:clé` reste la forme canonique de la fiche ; une URL à alias redirige (remplacement d'historique) vers la clé canonique. Les anciennes clés dans des courriels et documents continuent de fonctionner tant que l'alias existe ; les alias ne sont jamais supprimés.

### Risques
- Migration lourde sur une grosse base (réécriture de la clé de chaque artefact) : faite en lot dans la migration 030, mesurée sur 100 000 artefacts avant fusion.
- Dépôts GitLab déjà synchronisés : le commit de renommage doit être idempotent et reprendre après interruption.
- Hooks et scripts externes qui analysent les clés (CLI, intégrations maison) : documentés dans `docs/api/REFERENCE.md`.

## 3. Routes (Lot 1)

| Adresse | Contenu |
| --- | --- |
| `/p/:projet` | Vue d'ensemble (onglet 1) |
| `/p/:projet/trackers`, `/planification`, `/tracabilite`, `/documents`, `/code`, `/activite`, `/membres` | Onglets 2 à 8, dans cet ordre ; masqués selon les modules actifs |
| `/p/:projet/recherche` | L'ancienne liste ATQL, devenue une vue |
| `/p/:projet/t/:tracker/:vue` | Écran Tracker ; `:vue` = `tableau`, `board`, `arbre`, `matrice` ou l'identifiant d'une vue enregistrée |
| `/p/:projet/t/:tracker/:vue?i=CLÉ` | Même écran avec le panneau de détail ouvert (adresse partageable) |
| `/p/:projet/a/:clé` | Fiche complète |

Conservées sans changement : `/p/:projet/board/:board`, `/p/:projet/dashboard`, `/p/:projet/admin`, `/p/:projet/trackers/new`, `/p/:projet/trackers/:tracker/config`. Le segment `t/` (écran) est distinct de `trackers/` (configuration) pour éviter toute collision.

**Redirections** (permanentes dans le code, jamais supprimées) : `/p/:projet?q=…` → `/p/:projet/recherche?q=…` ; `/p/:projet/manage` → `/planification` ; liens « tracker = X » de l'ancienne page Projets → `/t/X/tableau`.

La spécification donne en exemple `/sat1/exigences/arbre-urd/SAT1-REQ-0042`. La mission impose `/p/:projet/t/:tracker/:vue` : c'est cette forme qui est retenue, `/p/` conservant la compatibilité avec les liens existants.

**Modules actifs** : déduits des données, sans migration (planification = sprints ou boards existants ; code = dépôt lié ; documents = source indexée ; traçabilité = au moins un type de lien). Une table de réglage de modules par projet reste possible plus tard sans casser les routes.

## 4. Modèle de données (migrations 030 et suivantes)

Les numéros sont indicatifs : chaque tâche prend le prochain numéro libre. Toute nouvelle table : `organization_id`, RLS forcée, politique `org_isolation`, droits `athena_app`, vérifiés par le test existant sur les migrations.

| N° | Contenu | Tâche |
| --- | --- | --- |
| 030 | `artifact_key_alias`, unicité de clé par organisation, réécriture des clés, `resolve_artifact` | T-0049 |
| 031 | `tracker_type` d'organisation, `tracker.type_key` | T-0097 |
| suivante | `saved_filter` : `tracker_key`, `view`, `columns`, `is_default` | T-0057 |
| 032 | `user_pin` : favoris, récents, ordre | T-0060 |
| 033 | Types de liens d'organisation (`project_id` nullable), `link_type_pair` | T-0063 |
| 034 | `field_definition.is_content` (défaut vrai : comportement actuel préservé) | T-0064 |
| 035 | `coverage_rule` | T-0068 |
| 036 | Gabarits normatifs versionnés (`project_template_version`, rattachement du projet) | T-0069 |
| 037 | `tailoring` (conformité) | T-0072 |
| 038 | Listes d'ayants droit, marquage de contrôle export | T-0079 |
| 039 | `doc_node` : position, parent, profondeur | T-0081 |
| 040, 041 | Notifications ; circuits d'approbation | T-0091, T-0094 |

Les types de liens d'organisation **coexistent** avec les types par projet : à clé égale, celui du projet prime dans son projet. Aucun lien existant n'est modifié.

**Suspicion** : aujourd'hui `artifact_link.suspect` passe à vrai pour tout lien **entrant** (`to_artifact_id`) dès qu'une valeur change (`artifact.service.ts:107`). Après T-0064, seul un changement d'un champ `is_content` le fait. Le sens du lien (amont = cible du lien sortant d'un enfant) reste celui de l'implémentation actuelle ; à confirmer pour les types dont le libellé s'inverse (question 4).

## 5. Rétrocompatibilité

- API : toutes les routes actuelles restent. Les clés (anciennes ou nouvelles) sont acceptées en entrée ; les réponses portent la clé canonique et, quand l'entrée était un alias, `canonicalKey`.
- Filtres enregistrés : sans `tracker_key`, ils restent des filtres de projet (page Recherche).
- Gabarits : les gabarits existants (`trackers` seul) restent valides ; les champs normatifs sont facultatifs.
- Aucun appel réseau externe n'est ajouté (polices et ressources embarquées ; contrôlé par T-0076/T-0077).

## 6. Points de vigilance de la reprise

- Le commit `ee3b0a2` a déjà corrigé les constats F-01 (confirmations), F-02 (toasts d'erreur), le lien d'évitement, l'aide, les tailles, les cibles et le mobile. T-0061 ne les refait pas : il les **verrouille par des tests** et T-0096 vérifie ce qui reste.
- `docs/dev/SPEC_IHM.md` est l'ancien fichier non suivi « Athena — Organisation de l'IHM et fonctionnalités.md », renommé. Il ne contient pas l'onglet « Écart prototype / cible » cité par la mission ; l'analyse d'écart de ce plan vient de la lecture du code.
- Lot 6 : aucun code avant les réponses sur les projets Tuleap prioritaires et le sort de l'historique Jira (T-0086).

## 7. Réponses du demandeur (2026-11-06)

1. Board par tracker : oui, la vue Board d'un tracker est le board de projet filtré sur ce tracker.
2. **Types de tracker d'organisation introduits** (T-0097) ; les paires de liens autorisées s'expriment en types (T-0063).
3. Catégories de trackers : oui, déduites du type (« Autres » sans type).
4. Sens de la suspicion : en attente. Proposition : même comportement pour tous les types de liens, avec un réglage « propage la suspicion » par type de lien (T-0064).
5. Clé de projet non modifiable après le premier item (T-0049).
6. Dépôt GitHub désormais privé : plus de blocage pour le Lot 4. Rien n'est poussé sans demande.
7. Seuils de couverture : doivent être renseignables (T-0075), aucune valeur imposée.
8. Migration (Lot 6) : traitée en toute fin de projet, après le Lot 7.
