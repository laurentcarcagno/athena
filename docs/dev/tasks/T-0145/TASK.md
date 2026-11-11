# T-0145 : créer une automatisation depuis l'interface

- **Objectif** : rendre les automatisations utilisables sans l'API (revue d'ergonomie, B4 ; ADR-0005 § 2.1).
- **Critères d'acceptation** : formulaire « Quand / Si / Alors » sur les déclencheurs et actions de l'API, 3 modèles réalisables, explication ; liste lisible avec activation ; tests web ; e2e : création depuis un modèle.
- **Fichiers** : `apps/web/src/components/AutomationEditor.tsx`, `pages/SettingsPanels.tsx` (ancien panneau retiré), `pages/SettingsPage.tsx`, `i18n.ts` (`automation`), `automation-editor.test.tsx` ; `packages/ui/src/styles/views.css` ; `e2e/tests/ergonomie.spec.ts`.
