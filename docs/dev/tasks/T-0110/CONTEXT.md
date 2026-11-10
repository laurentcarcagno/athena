# Journal de la tâche T-0110

## Fait (2026-11-10)
- `components/MobileNav.tsx` :
  - `ProjectNavContext`, alimenté par `useRailSections`, qui renvoie maintenant `projectNav` (sections visibles et section courante) ;
  - `SectionPicker`, affiché par `ProjectLayout` : bouton à déplier et liens ;
  - `BottomBar`, rendue par la coquille hors de `<main>`, pour rester utilisable quand `main` est inerte.
- L'ancien bouton « Menu » du haut est supprimé. Celui de la barre basse garde la classe `ath-menu-btn` : la coquille y rend le focus à la fermeture du tiroir.
- Palette :
  - elle s'ouvre aussi par l'événement `athena:open-palette` (bouton « Chercher ») ;
  - **correctif** : le focus va désormais au champ dès l'ouverture, ce qui vaut aussi pour `Ctrl+K`. La référence existait mais n'était pas utilisée.
- `styles.css` :
  - sélecteur et barre basse masqués au-dessus de 768 px ;
  - cibles de 44 et 48 px ;
  - réserve en bas de `main` ;
  - vues du tracker sur une ligne avec défilement dans leur cadre ;
  - règles `.ath-menu-btn` remplacées.
- Tests :
  - `mobile-nav.test.tsx` (9) ;
  - e2e `navigation.spec.ts` : deux scénarios, à 390 px et sur poste de travail.
- Vérifications : Vitest web 354 sur 354, `@athena/ui` 51 sur 51, `tsc` OK, `lint-design` OK, e2e 33 sur 33 (axe en clair et en sombre compris).

## Reste à faire
Rien.

## Décisions et pièges
- Le fil d'Ariane garde son retour à la ligne sur mobile : un cadre défilant couperait le menu de ses frères, positionné en absolu.
- Pas de nouveau token : la barre et le sélecteur n'utilisent que des tokens existants (`instrument-white`, `console-border`, `console-sky`, `text-link`, `selection-veil`, `focus-ring`). Les cibles de 44 px dépassent le minimum de 24 px de la charte, ce qui est voulu pour le tactile.
- Le nom accessible du sélecteur est son texte visible (« ARI · Activité ») ; seule la flèche est masquée.

## Commandes utiles
`cd apps/web && npx vitest run src/mobile-nav.test.tsx` ; `cd e2e && node global-setup.mjs && npx playwright test tests/navigation.spec.ts`

## Prompt de reprise
Lire `docs/dev/STATE.md`, `docs/dev/tasks/LOT9-PLAN.md`, puis T-0111 (création contextuelle).
