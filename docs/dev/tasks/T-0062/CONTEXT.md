# Journal de la tâche T-0062

## Fait
- API : `GET …/link-types`, `DELETE …/links/:id` (événement `link.deleted`, audit `link.delete`, lien d'un autre projet = 404) ; tests dans `links.test.ts`.
- Web : `LinkEditor` (liste typée dans les deux sens, acquitter, supprimer avec confirmation, création type puis cible avec autocomplétion clé ou titre, sens sortant ou entrant, l'item lui-même exclu) intégré à l'onglet Liens de `ArtifactView` (fiche et panneau) ; raccourci **L** (ignoré en saisie) ; le focus attend l'apparition du sélecteur (`focusSignal`).
- Tests : `web12.test.tsx` (9), e2e `liens.spec.ts` (création, suspect après modification de la cible, acquittement, suppression).

## Reste à faire
- Types de liens d'organisation et paires autorisées (T-0063) : le sélecteur propose aujourd'hui tous les types du projet.

## Décisions et pièges
- Un type symétrique (mêmes libellés) n'apparaît qu'une fois.
- Le focus du raccourci L doit attendre le chargement des types : bug trouvé par l'e2e, invisible en jsdom.
- Dans les e2e, `getByRole('button', {name: 'Lier'})` doit être `exact` (« Replier le rail » contient « lier »).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0063.
