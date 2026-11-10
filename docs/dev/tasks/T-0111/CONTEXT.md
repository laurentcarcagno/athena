# Journal de la tâche T-0111

## Fait (2026-11-10)
- `lib/create-target.ts` : `CreateTarget`, `Created`, `targetOf(adresse)`, qui s'appuie sur `placeOf` de T-0109.
- `components/CreateArtifact.tsx` :
  - `CreateArtifact` prend `target`. En portée globale, il propose la liste des projets (pré-choisi s'il n'y en a qu'un), puis les trackers du projet. Si la liste des trackers échoue, le tracker pré-choisi reste seul proposé.
  - `CreateProvider` (dans la coquille) offre `useCreate()`, `useOnCreated()`, la touche `N` et le message avec action.
  - `CreateButton` est placé dans la barre haute (nom accessible « Créer un ticket », texte visible « Créer »).
- Écran Tracker et Recherche : leur bouton appelle la création commune. Après création, la liste se recharge (compteur `refresh`) et l'écran Tracker ouvre le ticket dans le panneau (`?i=`). La vue Board se remonte.
- `@athena/ui` : `useToast()` accepte une action facultative `{ label, onClick }`. Un message qui porte une action reste affiché jusqu'à sa fermeture (WCAG 2.2.1), et l'action le ferme.
- Tests :
  - `create-flow.test.tsx` (6) ;
  - `components.test.tsx` (`@athena/ui`, +1) ;
  - `web2` et `a11y` adaptés au nouveau contrat ;
  - e2e `creation.spec.ts` (3).
- Vérifications : Vitest web 360 sur 360, `@athena/ui` 52 sur 52, `tsc` OK, `lint-design` et `validate-design` OK, e2e 36 sur 36.

## Reste à faire
Rien.

## Décisions et pièges
- Raccourci `N` et non `C` : `SPEC_IHM.md` attribue `C` à « commenter » sur la fiche. Le plan est corrigé.
- Les effets de `CreateArtifact` dépendent d'une clé stable (`scope:projet:tracker`) : un appelant peut recréer l'objet cible à chaque rendu.
- `@athena/ui` est servi depuis `dist` pour le JavaScript : `npm run build` dans `packages/ui` après toute modification de `components.tsx`. Le CSS, lui, est lu depuis `src`.
- Test `web15` (Matrice) : un échec intermittent sous la charge de la suite complète (2,1 s), jamais reproduit seul (3 sur 3). À surveiller.

## Commandes utiles
`cd apps/web && npx vitest run src/create-flow.test.tsx` ; `cd e2e && node global-setup.mjs && npx playwright test tests/creation.spec.ts`

## Prompt de reprise
Lire `docs/dev/STATE.md`, `docs/dev/tasks/LOT9-PLAN.md`, puis T-0112 (fiche : en-tête complet, onglet dans l'URL).
