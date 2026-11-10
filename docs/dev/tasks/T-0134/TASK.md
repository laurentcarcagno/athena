# T-0134 : composants normalisés

- **Objectif** : onglets unifiés (état et liens), pastille / tag / filtre distincts, bouton-icône unique, sélection et survol communs, tableau à en-tête clair, PageHeader avec le projet, Card en deux variantes.
- **Critères d'acceptation** : routes inchangées (tests de navigation verts) ; flèche de tri ≥ 3:1 et libellé de filtre ≥ 4,5:1 (contrat de thème) ; vues du tracker, rapports et paramètres en onglets-liens ; un seul bouton-icône ; tests et e2e verts.
- **Fichiers** : `packages/ui/src/components.tsx`, `styles/{containers,controls,shell,rail,tickets,views}.css`, `normalisation.test.tsx` ; `packages/themes/contract.json` ; `apps/web/src` (TrackerScreen, ReportsPage, SettingsPage, ProjectShell, App, ThemeToggle, 13 pages sans clé de projet dans le titre, dates seules, tests).
