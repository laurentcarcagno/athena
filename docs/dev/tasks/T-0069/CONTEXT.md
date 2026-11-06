# Journal de la tâche T-0069

## Fait
- Migration **037** (la fiche disait 036, déjà prise) : `project_template` gagne `parent_key`, `parent_version`, `normative`, `version`, `status` ; table `project_template_version` (instantané immuable : droits `select, insert` seulement, RLS forcée, `org_isolation`) ; `project` gagne `template_key`, `template_version`, `criticality`, `current_phase`. La table `tailoring` de T-0072 prendra le numéro 038.
- `normative-template.ts` : schéma zod du modèle (référentiel, criticité, revues, phases avec critères d'entrée et de sortie, livrables, règles de couverture, paramètres par catégorie laissés à `null`, marquage, `mandatory`, `remove`), `normativeProblems` (phase sans revue, livrable inconnu, règle ou critère sur tracker ou état inconnu, doublons), `elementPaths`, versions « majeure.mineure », YAML aller-retour.
- `TemplateService` : `list` expose `normative`, `parent`, `version`, `status`, `versions` ; `create`/`update` valident le modèle et repassent le gabarit en brouillon ; `publish`, `versions`, `snapshot`, `exportYaml`, `importYaml` ; `createProject(..., { version, criticality })` crée le projet depuis la version publiée (dernière par défaut), le rattache (`template_key`, `template_version`), pose la criticité et la première phase, et copie les règles de couverture du gabarit au niveau du projet.
- Routes : `POST /v1/project-templates/:key/publish`, `GET .../versions`, `GET .../export`, `POST .../import`, `POST /v1/projects` accepte `templateVersion` et `criticality`.
- Tests : `normative-template.test.ts` (9), `template-versions.test.ts` (8, dont immuabilité refusée par la base).

## Décisions
- Un gabarit jamais publié reste utilisable tel quel (gabarits historiques) : le projet garde alors `template_version` nul.
- Un gabarit publié puis modifié devient « brouillon » ; les nouveaux projets utilisent la dernière version **publiée**, jamais le brouillon.
- Versions « majeure.mineure » comparées numériquement (1.10 > 1.9).

## Écarts
- Aucun.

## Prompt de reprise
T-0070 : héritage (`template-inherit.ts`). Les colonnes `parent_key`/`parent_version` existent déjà mais ne sont pas encore lues.
