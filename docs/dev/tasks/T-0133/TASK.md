# T-0133 : contrôles de formulaire

- **Objectif** : composants `Select`, `Textarea`, `Checkbox`, `Radio`, `Switch` ; hauteur unique ; états survol, focus, erreur, désactivé, lecture seule ; migration des contrôles nus.
- **Critères d'acceptation** : aucun `<select>`, `<textarea>` ni case à cocher nus dans `apps/web/src` (test) ; champ, liste, recherche et bouton à 32 px et anneau de focus de 2 px **mesurés** dans le navigateur (`e2e/tests/controles.spec.ts`) ; lecture seule avec cadenas et raison ; tests et e2e verts.
- **Fichiers** : `packages/ui/src/components.tsx`, `styles/controls.css`, `styles/shell.css`, `controls.test.tsx` ; `packages/themes` (`size.toggle`) ; 33 fichiers de `apps/web/src` migrés ; `pages/ArtifactPage.tsx` (lecture seule par `writeRoles`) ; `lib/dates.tsx` (`DateTime`) ; `i18n.ts` ; `controles.test.tsx`, `web9.test.tsx` ; `e2e/tests/controles.spec.ts`.
