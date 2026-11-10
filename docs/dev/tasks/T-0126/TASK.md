# T-0126 : cadrage du lot 10 (thèmes)

- **Objectif** : consigner les décisions du demandeur (ADR-0004), planifier le lot 10, faire évoluer la charte et `CLAUDE.md`, prendre les captures de référence qui serviront de non-régression aux tâches de plomberie (T-0127 à T-0131).
- **Critères d'acceptation** (testables) :
  - `docs/dev/DECISIONS/ADR-0004-themes.md` et `docs/dev/tasks/LOT10-PLAN.md` écrits ;
  - `DESIGN.md` § 1 (note d'évolution) et journal (D-019, aussi dans `DESIGN.json`, version 3.2.0) ; `validate-design --strict` et `lint-design` OK ;
  - `CLAUDE.md` (Conception) à jour ;
  - `e2e/tests/visuel.spec.ts` : 12 écrans × clair et sombre × 375, 768, 1024, 1440 px ; références dans `e2e/visuel/reference/` (ignoré par Git) ; une seconde exécution les retrouve.
- **Fichiers concernés** : les documents ci-dessus, `e2e/tests/visuel.spec.ts`, `e2e/playwright.config.ts` (`snapshotPathTemplate`), `.gitignore`.
- **Hors périmètre** : tout changement de code de l'interface.
- **Dépendances** : réponses du demandeur du 2026-11-10 (audit visuel, proposition de thèmes).
