# État du projet

Dernière mise à jour : 2026-10-31

- **Phase** : toutes les phases du plan sont engagées ; voir le tableau « État d'implémentation » (§ 25) de `ATHENA_PLAN_DEVELOPPEMENT.md`.
- **Fait** : T-0001 à T-0040 (e2e Playwright, accessibilité, interface et quotas des pièces jointes, actions/widgets de plugins, rétroportages, DORA, notes de version, CLI, job CI, permissions par champ, plein texte, pièces jointes, OpenAPI) (voir `docs/dev/tasks/`). Backend complet (noyau, historique GitLab, ATQL, agile, plugins, webhooks, automatisations, import, sécurité), application web FR/EN, images de conteneur, chart Helm, documentation (`docs/admin`, `docs/user`, `docs/plugins`, `docs/api`, `docs/security`, `docs/perf`).
- **Tâche en cours** : aucune.
- **Reste à faire** (par priorité) :
  1. Test d'intrusion externe (à commander) ; déploiement de recette sur Kubernetes et mesures de charge concurrente.
  5. Écarts mineurs : interface des rôles de champ, permissions par transition, suppression/renommage de champs, swimlanes, Gantt.
- **Blocages** : relevés d'environnement (GitLab interne, OpenBao, LDAP, Kubernetes : plan § 23.2). Rien n'est poussé ; l'accès SSH à `gitlab.karka.lan:2222` n'a pas été testé.
