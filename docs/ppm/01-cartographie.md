# PPM Athena — 01. Cartographie de l'existant

Étude du 2026-11-15, sur `develop` au commit `0204ea5`. Aucun fichier de code n'est modifié ; seul `docs/ppm/` est écrit.

**Mise à jour après la phase 1** : à votre demande (réponse 8), P2 (filtre des droits sur `portfolio_project` et `baseline_schedule`, comptage corrigé) et le volet critères de P6 (critères manuels à confirmer, critères d'entrée évalués) sont faits dans le commit `8b5d77c`, migration `064_gate_checks_acl.sql`. Les constats ci-dessous décrivent l'état d'avant ce commit.

## Résumé

1. Le niveau projet est solide pour l'**ingénierie** : trackers configurables, workflows, traçabilité, gabarits normatifs versionnés, ACL fines appliquées dans PostgreSQL.
2. La **planification** existe (moteur de dates, calendrier d'organisation, chemin critique, baselines datées), mais elle est **bornée à un projet** : aucun lien ni aucune dépendance entre projets.
3. Le lot 16 a ajouté un premier socle de portefeuille (portefeuilles, rattachement des projets, santé consolidée, équipes, charge en tickets ouverts). Ce socle fuit le **nombre** de projets cachés : c'est un défaut à corriger avant tout PPM.
4. Le projet est un objet presque nu : clé, nom, date de création, gabarit, criticité, phase courante. Il n'a ni dates, ni statut de cycle de vie, ni sponsor, ni description.
5. Le **suivi des temps, les ressources, les compétences, les absences, la capacité et les finances sont absents**. La charge n'est mesurée qu'en nombre de tickets et en un champ « reste à faire » sans unité définie.
6. Les **stage gates** existent en germe : phases, revues, livrables et critères de sortie dans les gabarits normatifs. Mais les critères manuels sont considérés comme remplis d'office, et les critères d'entrée ne sont jamais évalués.
7. Côté visualisation : aucune bibliothèque de graphiques (SVG faits main), aucun export PDF ni Excel, des exports CSV ponctuels.
8. Aucun job d'agrégation ni de snapshot : toute consolidation est calculée à la demande.
9. **Décisions attendues de votre part** : les cinq paramètres de cadrage (voir la fin du document), puis valider les prérequis de niveau projet (P1 à P6) avant la phase 2.

Légende : **Observé** (référence citée), **Hypothèse** (impact si faux), **Manquant** (à obtenir, auprès de qui).

---

## 1. Projets, programmes, équipes, organisations

| Élément | Constat |
|---|---|
| Organisation | **Observé** : table `organization` (`apps/api/src/db/migrations/001_core.sql`), isolation RLS de toutes les tables par `organization_id = current_org()` (`003_outbox_audit_rls.sql`). Une organisation correspond à un groupe Keycloak `/org-<clé>` (`deploy/ci/athena-check.gitlab-ci.yml:7`). |
| Projet | **Observé** : `project(id, organization_id, key, name, created_at)` (`001_core.sql:23-31`), plus `template_key`, `template_version`, `criticality`, `current_phase` (`037_normative_templates.sql:29-33`). **Manquant** : dates de début et de fin, statut (actif, suspendu, clos), sponsor, description, budget. |
| Programme, initiative | **Observé (absence)** : aucune table ni aucun type. Un projet n'a pas de parent. |
| Membres de projet | **Observé** : `project_member(subject, role manager/member)` (`025_project_members.sql:2-9`), gestion réservée à l'administrateur ou au chef désigné (`apps/api/src/core/member.service.ts:55-63`). |
| Équipes | **Observé** (lot 16) : `team`, `team_member` (manager/member) (`063_teams_portfolios.sql`), service `apps/api/src/core/team.service.ts`. Une équipe n'est rattachée ni à un projet ni à une direction. |
| Portefeuille | **Observé** (lot 16) : `portfolio(key, name, description, owner_subject)` et `portfolio_project(position, health_override, note)` (`063_teams_portfolios.sql`). Synthèse calculée à la demande, projet par projet (`apps/api/src/core/portfolio.service.ts:95-131`). Pas de hiérarchie (portefeuille → programme), pas d'historique. |
| Écrans | **Observé** : `/projets` (`apps/web/src/pages/ProjectsPage.tsx`), `/charge` (`TeamLoadPage.tsx`), `/portefeuilles` (`PortfoliosPage.tsx`). |
| Limite | Toutes les lectures d'une organisation voient tous ses projets, sauf ceux qu'une liste d'ayants droit masque (§ 7). Le directeur n'a pas de périmètre propre (`docs/dev/DECISIONS/ADR-0008-roles-equipes-portefeuilles.md` § 2.3). |

## 2. Tâches, tickets, sprints, versions, workflows

| Élément | Constat |
|---|---|
| Ticket (artefact) | **Observé** : `artifact` avec valeurs en JSON, statut, révisions et liens (`002_artifacts.sql`). Clé `PROJET-TRACKER-0001` (`030_item_keys.sql`). Champs typés, et rôles sémantiques `title, description, status, assignee, due_date, estimate, priority, version, start_date, progress, remaining` (`058_planning_model.sql:4-6`). |
| Types de tracker | **Observé** : exigence, interface, conception, tâche, anomalie, évolution, test, campagne, non-conformité, **risque, action, décision, revue** (`apps/api/src/core/tracker-types.ts:24-37`). Ce ne sont que des données : aucun comportement propre à un type. |
| Workflow | **Observé** : statuts à 3 catégories (todo, in_progress, done), transitions avec validateurs `required_fields` et `approval` (`apps/api/src/core/templates.ts:26-28`), circuits d'approbation par étapes (`046_approval_flows.sql:6-19`). |
| Epics, stories | **Hypothèse** : portés par des trackers et un lien hiérarchique (`link_type.hierarchical`), sans objet dédié. Impact si faux : nul pour le PPM, qui n'agrège pas à ce grain. |
| Sprints, backlog | **Observé** : `sprint`, `sprint_item` (`009_agile.sql`), points engagés et réalisés figés (`016_reporting.sql:2-3`), rang du backlog (`048_backlog_rank.sql`), burndown (`apps/api/src/agile/agile.controller.ts:249`). |
| Versions (releases) | **Observé** : `release(starts_on, ends_on, state planned/released)` et `release_item` (`016_reporting.sql:5-27`), approbation des jalons par l'assurance qualité (`041_approval.sql`). |
| Événements | **Observé** : outbox transactionnelle (`003_outbox_audit_rls.sql`), consommée par les webhooks, automatisations et plugins (`apps/api/src/workers/tasks.ts:40-64`). |

## 3. Planification

| Élément | Constat |
|---|---|
| Moteur de dates | **Observé** : fonction pure `computeSchedule` (`apps/api/src/planning/schedule-engine.ts:5-14, 61`) : passe avant et arrière, marge totale, chemin critique, parentes calculées depuis leurs enfants, jalons de durée nulle. |
| Dépendances | **Observé** : lien ordonné « précède » avec décalage en jours ouvrés (`058_planning_model.sql`). **Limité au projet** : `LinkService` résout les deux extrémités dans le même projet (`apps/api/src/core/link.service.ts:74`, `205-207`, `resolve_artifact` dans `030_item_keys.sql:38-42`), et le planning ne charge que les liens internes (`apps/api/src/planning/schedule.service.ts:211-216`). |
| Calendrier | **Observé** : semaine ouvrée et jours fériés de l'organisation (`059_work_calendar.sql`), bibliothèque `apps/api/src/core/work-calendar.ts`. Le commentaire `work-calendar.ts:2` prévoit des absences qui n'existent pas. |
| Baselines | **Observé** : tag Git et SHA (`012_baselines.sql:2-8`), dates planifiées figées par ticket (`060_baseline_schedule.sql`), écart en jours affiché (lot 12). |
| API | **Observé** : `GET schedule`, `GET schedule/baselines`, `POST schedule/apply`, `PATCH schedule/tasks/:key`, `PATCH schedule/links/:id` (`apps/api/src/planning/planning.controller.ts:25-61`), roadmap des versions (`agile.controller.ts:174`). |
| Gantt | **Observé** : composant SVG maison `apps/web/src/components/ScheduleGantt.tsx` (424 lignes), éditable (glisser, étirer, lier, clavier). |
| Avancement | **Observé** : rôle `progress` (saisi) et répartition par catégorie de statut (`apps/api/src/agile/kpi.service.ts:63`). Pas d'avancement pondéré par la charge. |
| Limite | Pas de planning multi-projets, pas de roadmap de portefeuille, pas de scénario. |

## 4. Ressources, affectations, compétences, absences, temps passé

| Élément | Constat |
|---|---|
| Ressource | **Observé (absence)** : seul `user_account` (compte connu après une connexion) existe. Aucun taux, rôle métier, coût ni temps partiel. |
| Affectation | **Observé** : une personne par ticket via le rôle `assignee`. Aucune affectation à un projet en pourcentage ou en ETP. |
| Charge | **Observé** (lot 16) : tickets ouverts, en retard et somme du champ `remaining` par personne (`apps/api/src/core/team.service.ts:103-135`). L'unité de `remaining` n'est définie nulle part (**Manquant** : à fixer avec le PMO). |
| Compétences, absences, capacité | **Observé (absence)** : aucune table ni aucun champ (recherche `skill|absence|capacity` sans résultat dans `apps/api/src`). |
| Temps passé | **Observé (absence)** : aucun worklog. Le lot 14 « temps et capacité » n'est qu'esquissé (`docs/dev/DECISIONS/ADR-0006-gestion-de-projet.md:70`). |

## 5. Risques, problèmes, actions, décisions, documents, livrables

| Élément | Constat |
|---|---|
| Risques | **Observé** : type de tracker `risk` (`tracker-types.ts:34`). Rapport Risques qui lit les champs `probability`, `impact`, `criticality` s'ils existent, avec des paliers faible à critique (`apps/web/src/pages/project/RisksTab.tsx:14-24`). Ces champs ne sont **pas** des rôles sémantiques : le rapport dépend de leur nom. |
| Actions, RID | **Observé** : type `action`, trackers RID (spatial, `apps/api/src/core/templates/spatial.ts:42`) et RRV (défense, `templates/defense.ts:29`) rattachés à une revue. |
| Décisions, dérogations | **Observé** : type `decision`, trackers RFD/RFW (`spatial.ts:38`) et DRC (`defense.ts:26`). |
| Changements | **Observé** : tracker CR « Demandes de modification » avec un champ `impact` (aucun, coût, planning, technique) (`spatial.ts:35`, `defense.ts:23`). C'est un sélecteur, sans montant ni durée. |
| Problèmes | **Observé** : anomalies (SPR) et non-conformités (NCR, faits techniques) (`spatial.ts:32-34`, `defense.ts:21`). |
| Documents, livrables | **Observé** : liaison StrictDoc en lecture (`007_docs.sql`, `043_doc_read.sql`), livrables déclarés par phase dans les gabarits (`spatial.ts:66-77`). Il n'y a pas d'objet « livrable » avec date et état. |
| Limite | Ces objets sont tous **par projet**. Aucun risque transverse ni aucun journal de décision de portefeuille. |

## 6. Budgets, coûts, finances

**Observé (absence)** : aucune table, aucun champ ni aucun rôle sémantique financier. Le seul signal est la valeur « coût » du champ `impact` d'une CR (`spatial.ts:35`). **Manquant** : sources financières réelles (saisie, export d'un outil), à obtenir auprès de la direction financière.

## 7. Utilisateurs, rôles, permissions

| Élément | Constat |
|---|---|
| Rôles | **Observé** : `athena-admin`, `athena-pm`, `athena-qa`, `athena-team-member`, `athena-manager`, `athena-director` (`deploy/dev/keycloak/athena-realm.json`). Rôle effectif dans `withUserRole` : le directeur a les droits d'un membre d'équipe en lecture seule (`apps/api/src/auth/auth.guard.ts:26-33`). Contrôle par `@Roles` sur chaque route. |
| ACL | **Observé** : listes d'ayants droit appliquées en **politiques RLS restrictives** sur `project`, `tracker`, `artifact` et les tables filles (`039_access_lists.sql:61-80`), marquage de contrôle export (`040_export_control.sql:30,48`), permissions de lecture et d'écriture par champ (`019_field_permissions.sql`). |
| Agrégats | **Observé** : les tables récentes n'ont **pas** de politique restrictive. `baseline_schedule` n'a que l'isolation d'organisation (`060_baseline_schedule.sql:13`), comme `team`, `team_member`, `portfolio` et `portfolio_project` (`063_teams_portfolios.sql`). Conséquence mesurable : `PortfolioService.list` compte les lignes de `portfolio_project` sans jointure sur `project` (`apps/api/src/core/portfolio.service.ts:32` et `139`), donc **le nombre de projets d'un portefeuille inclut les projets masqués**. La synthèse détaillée, elle, joint `project` et ne les montre pas. |
| Audit | **Observé** : `audit_log` chaîné par hachage (`003_outbox_audit_rls.sql`), écrit par `audit()` (`apps/api/src/core/tracker.service.ts:379-387`). |

## 8. Gabarits normatifs et cycles de vie

| Élément | Constat |
|---|---|
| Modèle | **Observé** : gabarits versionnés et hérités (`037_normative_templates.sql`, `apps/api/src/core/template-inherit.ts`). Schéma avec normes, criticité, **revues**, **phases** (revue de fin, critères d'entrée et de sortie, livrables), règles de couverture et éléments obligatoires (`apps/api/src/core/normative-template.ts:10-50`). |
| Spatial | **Observé** : revues SRR, PDR, CDR, QR, AR, TRR, TRB (`spatial.ts:61-64`) ; phases exigences, conception préliminaire, conception détaillée, qualification, recette (`spatial.ts:71-77`). C'est le cycle **logiciel** ECSS-E-ST-40. **Manquant** : le cycle projet ECSS-M-ST-10 (phases 0, A à F ; MDR, PRR, SRR, PDR, CDR, QR, AR, ORR…) n'est pas modélisé. À fournir par le responsable méthodes. |
| Défense | **Observé** : revues SRR, PDR, CDR… et phases (`defense.ts:42-47`). |
| Passage de phase | **Observé** : `phaseCheck` n'évalue que les critères de **sortie**. Un critère `manual` vaut `met: true` sans saisie (`apps/api/src/core/template-upgrade.service.ts:103`), et les critères d'**entrée** ne sont jamais lus. `advancePhase` met à jour `project.current_phase` et écrit l'audit (`template-upgrade.service.ts:116-128`). Ni dates planifiées ou réelles de revue, ni décision de gate, ni historique des phases hors audit. |

## 9. Notifications, exports, API, intégrations, reporting

| Élément | Constat |
|---|---|
| Notifications | **Observé** : abonnements, notifications et préférences (`044_notifications.sql:6-46`), résumé quotidien par courriel (`045_digest.sql`). |
| Webhooks, automatisations | **Observé** : sortants (`006_webhooks.sql`), entrants (`013_automation_inbound.sql`), automatisations planifiées (`023_scheduled_automation.sql`). |
| Jobs | **Observé** : boucles `historique`, `webhooks`, `automatisations`, `plugins`, `sessions` (`apps/api/src/workers/tasks.ts:40-84`). Aucune boucle d'agrégation, de snapshot ni d'alerte de seuil. |
| Exports | **Observé** : CSV de conformité (`apps/api/src/core/normative.controller.ts:62`), écart de baselines (`apps/api/src/integrations/integrations.controller.ts:500`), export de gabarit (`template.controller.ts:114`), bandeau de marquage sur les exports (`apps/api/src/core/export-marking.ts`). **Absent** : export PDF ou Excel générique. |
| API | **Observé** : REST NestJS documentée en OpenAPI (`apps/api/src/openapi/openapi.controller.ts:17`), CLI et job CI (`deploy/ci/athena-check.gitlab-ci.yml`). |
| Intégrations | **Observé** : GitLab (historique, code, pipelines), StrictDoc, import JIRA et Tuleap (`017_import.sql`). |
| Instance isolée | **Observé** : déploiement en réseau isolé documenté (`docs/admin/INSTALLATION.md:90`), test d'absence de flux sortant (`e2e/tests/no-egress.spec.ts`). Un portefeuille ne peut donc agréger que son instance, ce qui est déjà le cas par construction. |
| Bascules | **Observé (absence)** : aucun mécanisme de bascule de fonctionnalité. Les « modules » d'un projet se déduisent de ses données (`apps/api/src/core/project-overview.service.ts:17-29`). |

## 10. Couche de visualisation

| Élément | Constat |
|---|---|
| Bibliothèques | **Observé** : aucune bibliothèque de graphiques ni de timeline. Les dépendances web se limitent à React, React Router, les polices et les paquets internes (`apps/web/package.json`). |
| Composants | **Observé** : anneau, barres et indicateur (`apps/web/src/components/ChartCard.tsx:12-67`), barre d'avancement (`ReleaseCharts.tsx:6`), Gantt (`ScheduleGantt.tsx`), matrice de traçabilité (`MatrixView.tsx`), comparaison de baselines (`BaselineCompare.tsx`), cartes de pilotage (`WidgetCards.tsx`, `ProgressCards.tsx`). Tout est en SVG ou HTML, avec texte alternatif. |
| Tableaux de bord | **Observé** : grille 2D personnelle par portée (accueil, projet, avancement) (`050`, `051`, `057` ; `apps/api/src/core/dashboard.service.ts:7-60`), catalogue filtré par rôle (`dashboard.service.ts:19-23`), 20 genres de cartes, dont `health` et `key-indicators` sur `GET /kpis` (`apps/api/src/agile/kpi.service.ts:40-90`). |
| Design system | **Observé** : thèmes à jetons (`@nuance/theming`, `packages/themes`), palette de données `data.1-8` contrôlée en contraste, composants `@athena/ui` (`packages/ui/src/components.tsx`), règle « la couleur ne porte jamais seule l'information » déjà appliquée aux pastilles. |
| Export image ou PDF | **Observé (absence)**. |

---

## Synthèse 1 : supposé contre observé

| Capacité supposée | Statut | Preuve | Conséquence pour le PPM |
|---|---|---|---|
| Projets | partiel | `001_core.sql:23-31`, `037:29-33` | Il faut des dates, un statut et un sponsor au projet avant toute roadmap (P1). |
| Équipes | partiel | `063_teams_portfolios.sql` | Utilisables pour regrouper la charge, sans capacité. |
| Utilisateurs, rôles, permissions | complet | `auth.guard.ts:26-33`, `039:61-80` | ACL à étendre aux agrégats (P2). |
| Tâches, backlogs, sprints, tickets, workflows, statuts | complet | `002`, `009`, `048`, `templates.ts:26-28` | Réutilisables tels quels. |
| Trackers, champs, documents, commentaires, pièces jointes, traçabilité | complet | `001`, `021`, `007`, `036` | Les demandes et les risques de portefeuille peuvent être des trackers. |
| Jalons | partiel | `016_reporting.sql:5-18`, jalons de durée nulle dans `schedule-engine.ts:11` | Deux notions de jalon (version datée, ticket sans début) à unifier pour la roadmap. |
| Dépendances | partiel | `link.service.ts:74` | **Pas de dépendance inter-projets** (P3). |
| Calendriers | complet (organisation) | `059_work_calendar.sql` | Pas de calendrier par personne. |
| Gantt | complet (projet) | `ScheduleGantt.tsx` | Réutilisable pour une timeline, à adapter au multi-projets. |
| Charges, ressources | absent (hors tickets assignés) | `team.service.ts:103-135` | La capacité ne peut pas être livrée en V1 sans un modèle de capacité (P4). |
| Avancement | partiel | `kpi.service.ts:63` | Par nombre de tickets, ce qui convient pour un indicateur de tendance. |
| Suivi du temps | absent | recherche sans résultat | Pas de « consommé ». |
| Risques, actions, décisions | partiel | `tracker-types.ts:34-36`, `RisksTab.tsx:14` | Probabilité et impact sans rôle sémantique (P5). |
| Livrables | partiel | `spatial.ts:66-77` | Listés par phase, sans échéance ni état. |
| Tableaux de bord | complet | `dashboard.service.ts` | Socle des widgets PPM. |
| Cycles de vie, stage gates | partiel | `template-upgrade.service.ts:95-128` | Critères manuels et d'entrée à corriger (P6) ; le cycle projet 0/A-F est à écrire. |
| Finances | absent | — | Tout est à créer, en saisie manuelle. |

## Synthèse 2 : réutilisation

| Domaine | Tel quel | À étendre | À agréger au portefeuille | À créer | À ne jamais dupliquer |
|---|---|---|---|---|---|
| Projet | clé, nom, gabarit, phase | dates, statut, sponsor, description | santé, avancement, phase | parent (programme) facultatif | le projet lui-même |
| Tickets et workflows | tout | — | comptes ouverts, en retard, bloqués | trackers « Demande » et « Risque transverse » sur un projet de pilotage | valeurs des tickets |
| Planification | moteur, calendrier, baselines | dépendances inter-projets | jalons et dates de fin par projet | timeline de portefeuille | dates des tickets |
| Ressources | comptes, équipes | capacité par équipe et période | charge par équipe | allocation en ETP, absences | affectations nominatives des tickets |
| Risques, décisions | trackers | rôles sémantiques probabilité et impact | exposition par projet | risques transverses | risques de projet |
| Finances | — | — | budget et réel par projet | budget, réel et prévision par projet et catégorie | — |
| Cycle de vie | phases et critères | évaluation complète, dates de revue | tableau de passage des gates | décisions de gate | phases du gabarit |
| Tableaux de bord | grille, catalogue | portée « portefeuille » | — | genres de cartes PPM | calculs des KPI (réutiliser `kpi.service`) |
| Permissions | RLS, rôles | politiques restrictives sur les nouvelles tables | règle de visibilité des agrégats | — | listes d'ayants droit |

## Risques repérés dans le code

1. **Fuite d'information par agrégat** (sévérité haute, contexte défense) : comptage de `portfolio_project` sans filtre ACL (`portfolio.service.ts:32,139`) ; `baseline_schedule` sans politique restrictive (`060_baseline_schedule.sql:13`). Les tables futures du PPM reproduiront le défaut si la règle n'est pas posée d'emblée.
2. **Coût des agrégations** : `PortfolioService.summary` lance, pour chaque projet, `KpiService.kpis`, soit quatre recherches ATQL et plusieurs requêtes (`kpi.service.ts:43-60`). C'est linéaire en projets, sans cache ni matérialisation. **Hypothèse** : acceptable jusqu'à quelques dizaines de projets ; à mesurer (la volumétrie cible est inconnue).
3. **Charge partielle sans le dire** : la charge d'une personne ne compte que les tickets visibles par le lecteur (RLS), sans signaler qu'une partie est masquée (`team.service.ts:111-119`).
4. **Unité de « reste à faire » non définie** (`058_planning_model.sql:6`) : additionner des heures et des points donnerait un total faux.
5. **Critères manuels toujours remplis** (`template-upgrade.service.ts:103`) : un gate PPM bâti dessus validerait des revues jamais tenues.
6. **Champs de risque par convention de nom** (`RisksTab.tsx:14-24`) : une agrégation de portefeuille serait fragile si chaque projet nomme ses champs autrement.
7. **Tests** : la partie lot 16 est couverte par un test d'intégration (`apps/api/src/core/team-portfolio.test.ts`), mais aucun test ne vérifie l'absence de fuite par les agrégats ; aucun e2e n'a été rejoué depuis le lot 12.

## Prérequis de niveau projet (avant le PPM)

| Id | Prérequis | Pourquoi | Taille |
|---|---|---|---|
| P1 | Dates, statut de cycle de vie, sponsor et description du projet | La roadmap et le tableau de santé n'ont rien à afficher sans ces données | S |
| P2 | Politiques RLS restrictives sur `portfolio_project`, `baseline_schedule` et toute table PPM, plus un test « agrégat sans fuite » | Confidentialité fine (contrainte du contexte) | S |
| P3 | Dépendances inter-projets (lien « précède » entre deux projets visibles) | Roadmap et propagation des retards | M |
| P4 | Modèle de capacité minimal : unité de charge, capacité par équipe et période | Toute la fonctionnalité F4 | M à L |
| P5 | Rôles sémantiques `probability`, `impact` (et `criticality` calculée) pour les risques | Exposition consolidée fiable | S |
| P6 | Gates : critères manuels saisis et datés, critères d'entrée évalués, dates de revue planifiées et réelles | F6 | M |

---

## Fin de phase 1

### Questions ouvertes (bloquantes pour la phase 2)

Les cinq paramètres de cadrage sont vides ; j'ai besoin de vos réponses avant de concevoir :

1. **Priorité métier de la V1** : par exemple visibilité de la roadmap et de la santé, ou capacité, ou finances ?
2. **Volumétrie cible** : nombre de projets par portefeuille et par instance, de tickets, de personnes, horizon en mois.
3. **Utilisateurs réels de la V1** : PMO, directeur, chefs de projet, managers ? Y a-t-il un rôle finance ?
4. **Granularité de la capacité** : semaine ou mois ? Et quelle unité pour « reste à faire » : heures, jours, points ?
5. **Données financières** : aucune, saisie manuelle, ou export d'un outil (lequel, et sous quel format) ?

Questions complémentaires :

6. Le cycle de vie projet spatial (phases 0, A à F et leurs revues) doit-il être ajouté comme gabarit normatif, et qui en fournit le contenu de référence ?
7. Un programme est-il un portefeuille de projets (même objet, imbriqué) ou un objet distinct ? Je recommande de commencer par un seul niveau.
8. Le défaut de comptage (P2) et les critères manuels (P6) peuvent-ils être corrigés dès maintenant, hors étude ? Ce sont de petits correctifs, mais cette étude ne modifie pas le code.

### Ce que je n'ai pas pu vérifier

- Les performances réelles de `PortfolioService.summary` sous charge (aucun test de charge sur ce chemin ; `apps/api/src/perf/` ne le couvre pas).
- L'usage réel des tableaux de bord (aucune télémétrie d'usage dans le dépôt).
- L'état des instances déployées (comptes Keycloak, volumétrie, données historiques) : hors dépôt.
- Le contenu exact de tous les écrans web ; je n'ai lu que ceux qui portent un domaine du PPM.
