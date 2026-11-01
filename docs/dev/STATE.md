# État du projet

Dernière mise à jour : 2026-11-01

- **Phase** : toutes les phases du plan sont engagées ; voir le tableau « État d'implémentation » (§ 25) de `ATHENA_PLAN_DEVELOPPEMENT.md`.
- **Fait** : T-0001 à T-0040 (e2e Playwright, accessibilité, interface et quotas des pièces jointes, actions/widgets de plugins, rétroportages, DORA, notes de version, CLI, job CI, permissions par champ, plein texte, pièces jointes, OpenAPI) (voir `docs/dev/tasks/`). Backend complet (noyau, historique GitLab, ATQL, agile, plugins, webhooks, automatisations, import, sécurité), application web FR/EN, images de conteneur, chart Helm, documentation (`docs/admin`, `docs/user`, `docs/plugins`, `docs/api`, `docs/security`, `docs/perf`).
- **Rôles et fenêtres (2026-11-01)** : rôle `athena-pm`, table `project_member` (migration 025), routes membres/utilisateurs/sprints, pages **Mon travail**, **Gestion de projet**, **Organisation** ; noms de statut, auteurs de commentaires et message d'erreur ATQL corrigés. Le compte `pm.dev` (mot de passe `dev-only-pm`) est créé par `tools/dev-start.mjs`.
- **Vue projet, workflow graphique, templates (2026-11-01)** : trackers en lignes (nom, artefacts, attributs), éditeur de workflow en machine à états (`WorkflowEditor`, SVG, clavier), templates de projet (migration 026, `TemplateService`, onglet Organisation > Templates, sélection à la création du projet).
- **Tâche en cours** : aucune.
- **Reste à faire** (par priorité) :
  1. Test d'intrusion externe (à commander) ; déploiement de recette sur Kubernetes et mesures de charge concurrente.
  5. Écarts mineurs : interface des rôles de champ, permissions par transition, suppression/renommage de champs, swimlanes, Gantt.
- **Blocages** : accès SSH à gitlab.karka.lan:2222 vérifié (authentification OK, aucun push). relevés d'environnement (GitLab interne, OpenBao, LDAP, Kubernetes : plan § 23.2). Rien n'est poussé ; l'accès SSH à `gitlab.karka.lan:2222` n'a pas été testé.
