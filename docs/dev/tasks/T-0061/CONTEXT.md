# Journal de la tâche T-0061

## Fait
- Fil d'Ariane persistant `Projet › Tracker › Vue › Item` (`Breadcrumb`, `crumbsFor` testé sur toutes les routes) dans la coquille ; segments cliquables, dernier = page courante.
- F-01 : confirmations ajoutées pour la suppression d'une pièce jointe et d'un filtre enregistré ; garde-fou `guards.test.ts` (aucun `confirm()` natif ; tout `DELETE` précédé de `confirm.ask` ou annoté « sans confirmation : … »).
- F-02 : tests UI (une erreur reste affichée, un succès disparaît ; pause au focus). F-07 : tests de la feuille de styles (troncature, clé insécable) et de `ArtifactTable`.
- Critère du lot : `navigation.test.tsx` (3 actions via Projets / tracker / item, 1 action via un favori, palette) ; e2e `navigation.spec.ts` écrit.
- `parcours.spec.ts` adapté au panneau de détail (bouton Agrandir) et à la confirmation de suppression d'une pièce jointe.
- Anciennes URL : `/p/:projet?q=`, `/manage`, `/dashboard` redirigent (T-0053) ; couvertes par `web9.test.tsx`.

## Reste à faire
- **e2e non rejoués** (ports 3000/3001 occupés par un serveur de développement de l'utilisateur) : `parcours.spec.ts` modifié et `navigation.spec.ts` nouveau sont à exécuter (`pnpm --filter @athena/e2e test`).
- Le critère dit « moins de 3 actions » : les parcours mesurés font 3 actions au plus (1 avec un favori). À confirmer si « moins de 3 » doit se lire « au plus 2 ».
- Sélecteur de frères dans le fil d'Ariane (spécification) : non fait.
- Épingler une vue depuis `SavedViews` ; onglet Activité (T-0101).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0101 (Activité) ; ensuite compte rendu du Lot 1.
