# Journal de la tâche T-0055

## Fait
- Planification (`ProjectManagePage`) sans l'onglet Acteurs : sprints, versions, boards ; titre « Planification ».
- Onglet Membres (`MembersTab`) : `ActorsTab` extrait et exporté, même restriction (chef de projet ou administrateur).
- Onglet Code et intégration (`CodeTab`) : dépôts liés (`code-repos`) et indicateurs de livraison (`dora?days=30`, tableau et non cinq tuiles identiques : charte).
- `IMPLEMENTED_TABS` : aperçu, trackers, planification, code, membres.
- Tests : `web9.test.tsx` (18 tests).

## Reste à faire
- Onglet Activité : sorti de cette tâche (API nouvelle) vers **T-0101**, ajouté au plan et à `STATE.md`.

## Décisions et pièges
- Les écrans de chef de projet gardent leur restriction de rôle ; ouverture aux autres rôles en lecture : à revoir avec « voir en tant que » (hors lot).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0056 (écran Tracker).
