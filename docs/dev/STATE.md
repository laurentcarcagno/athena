# État du projet

Dernière mise à jour : 2026-11-01

- **Phase** : toutes les phases du plan sont engagées ; voir le tableau « État d'implémentation » (§ 25) de `ATHENA_PLAN_DEVELOPPEMENT.md`.
- **Fait** : T-0001 à T-0040 (e2e Playwright, accessibilité, interface et quotas des pièces jointes, actions/widgets de plugins, rétroportages, DORA, notes de version, CLI, job CI, permissions par champ, plein texte, pièces jointes, OpenAPI) (voir `docs/dev/tasks/`). Backend complet (noyau, historique GitLab, ATQL, agile, plugins, webhooks, automatisations, import, sécurité), application web FR/EN, images de conteneur, chart Helm, documentation (`docs/admin`, `docs/user`, `docs/plugins`, `docs/api`, `docs/security`, `docs/perf`).
- **Rôles et fenêtres (2026-11-01)** : rôle `athena-pm`, table `project_member` (migration 025), routes membres/utilisateurs/sprints, pages **Mon travail**, **Gestion de projet**, **Organisation** ; noms de statut, auteurs de commentaires et message d'erreur ATQL corrigés. Le compte `pm.dev` (mot de passe `dev-only-pm`) est créé par `tools/dev-start.mjs`.
- **Vue projet, workflow graphique, templates (2026-11-01)** : trackers en lignes (nom, artefacts, attributs), éditeur de workflow en machine à états (`WorkflowEditor`, SVG, clavier), templates de projet (migration 026, `TemplateService`, onglet Organisation > Templates, sélection à la création du projet).
- **Templates de tracker (2026-11-01)** : migration 027, `/v1/tracker-templates`, éditeur de tracker réutilisable (`TrackerBuilder`), page `/p/:projet/trackers/new` avec départ depuis un template, Organisation > Templates en deux volets (projet, tracker) avec création de tracker à la volée.
- **Disposition de la vue détails (2026-11-02)** : migration 028 (`tracker.layout`), `LayoutSchema`, `PATCH .../layout`, `tracker.yaml` et reconstruction, templates ; éditeur `LayoutEditor` (WYSIWYG, glisser-déposer + boutons), fiche artefact en grille de 3 colonnes.
- **Tâche en cours** : aucune.
- **Reste à faire** (par priorité) :
  1. Test d'intrusion externe (à commander) ; déploiement de recette sur Kubernetes et mesures de charge concurrente.
  5. Écarts mineurs : interface des rôles de champ, permissions par transition, suppression/renommage de champs, swimlanes, Gantt.
- **Blocages** : accès SSH à gitlab.karka.lan:2222 vérifié (authentification OK, aucun push). relevés d'environnement (GitLab interne, OpenBao, LDAP, Kubernetes : plan § 23.2). Rien n'est poussé ; l'accès SSH à `gitlab.karka.lan:2222` n'a pas été testé.

## Reprise IHM (plan du 2026-11-06, ADR-0002)

Objectif : amener le prototype vers `docs/dev/SPEC_IHM.md`. Plan et décisions : `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`. **Phase 1 (planification) terminée ; aucun code avant validation.** Une tâche par session, dans l'ordre ci-dessous ; arrêt et compte rendu à la fin de chaque lot.

- **Fait** : T-0048 (c541516) ; T-0049, T-0050, T-0098 (un seul commit, voir leurs CONTEXT.md). T-0051 et T-0052 faits : **Lot 0 terminé, arrêt pour compte rendu**. **Lot 1 ouvert par l'utilisateur** : T-0097, T-0100, T-0053, T-0054 et T-0055 à T-0059 faits ; prochaine tâche T-0060 (T-0101 Activité plus tard dans le lot).
- **Environnement** : `pnpm install` fait ; `deploy/dev/.env` créé (ignoré par Git) avec un jeton GitLab local ; e2e à rejouer quand les ports 3000/3001 sont libres.
- **Lot 0, hygiène et clés** : T-0048 hygiène (.turbo, spécification) · T-0049 clés : migration 030, génération, alias · T-0050 clés : analyse dans les textes (refs, branches, StrictDoc, webhooks, CLI) · T-0098 clés : résolution des alias dans les autres services et l'ATQL · T-0051 clés : historique GitLab · T-0052 clés : interface, redirections, e2e, documentation.
- **Lot 1, navigation** : T-0097 types de tracker d'organisation, API (031) · T-0100 types de tracker, interface · T-0053 coquille de projet et onglets · T-0054 Vue d'ensemble et Trackers · T-0055 Planification, Code, Membres · T-0101 Activité · T-0056 écran Tracker et Tableau · T-0057 filtres, bascule ATQL, vues enregistrées (031) · T-0058 Board dans le tracker · T-0059 panneau de détail · T-0060 rail, favoris, récents (032) · T-0061 fil d'Ariane, redirections, verrouillage F-01/F-02/F-07, critère « 3 actions ».
- **Lot 2, traçabilité** : T-0062 liens depuis la fiche · T-0063 types de liens d'organisation (033) · T-0064 suspicion sur champs de contenu (034) · T-0065 ATQL `suspect()`, `linkedTo()`, `notLinked()` · T-0066 vue Arbre · T-0067 vue Matrice · T-0068 règles de couverture et onglet Traçabilité (035).
- **Lot 3, gabarits normatifs** : T-0069 modèle versionné (036) · T-0070 héritage · T-0071 montée de version et rapport d'impact · T-0072 exigences normatives, CSV, conformité (037) · T-0073 gabarit Spatial · T-0074 gabarit Défense · T-0075 interface des gabarits.
- **Lot 4, instance Défense** : T-0076 réseau isolé (images, Helm, documentation) · T-0077 test d'absence de requête sortante · T-0078 bandeau et exports · T-0079 listes d'ayants droit · T-0099 marquage de contrôle export · T-0080 rôle AQ étatique (table `approval`).
- **Lot 5, StrictDoc** : T-0081 API de consultation (039) · T-0082 onglet Documents · T-0083 artefacts citants · T-0084 citer une exigence · T-0085 baselines couplées.
- **Lot 6, migration (exécuté en toute fin de projet, après le Lot 7)** : T-0086 cadrage (**arrêt : questions au demandeur**) · T-0087 Tuleap structure · T-0088 Tuleap artefacts · T-0089 Artidoc et import par l'interface · T-0090 Jira 7.1.6.
- **Lot 7, collaboration** : T-0091 notifications (040) · T-0092 résumé quotidien · T-0093 mentions · T-0094 circuits d'approbation (041) · T-0095 thème sombre · T-0096 constats restants de l'audit.
- **Ordre réel** : Lots 0, 1, 2, 3, 4, 5, 7, puis 6. Les numéros de migration sont indicatifs : chaque tâche prend le prochain numéro libre.
