# Journal de la tâche T-0113

## Fait (2026-11-10)
- API : `LinkView.propagatesSuspect` (`link.service.ts`).
- Web :
  - `LinkEditor` : `RELATION_GROUPS` et `relationGroup()`. L'onglet Liens rend un groupe « Relations » ; chaque groupe est une section titrée (`h4`, avec un compteur) et une liste nommée par le groupe ;
  - `lib/origin.ts` : `Origin`, `originOf`, `useOrigin`, `fromHere` ;
  - `ItemNav` (dans `ItemHeader.tsx`) : « Retour : … », Précédent / Suivant, position, J / K sur la page ;
  - origine transmise par la Recherche (`ArtifactTable origin`), « Agrandir » de l'écran Tracker, Mon travail, le Board, les liens et les informations clés ;
  - `ArtifactView` : les changements d'onglet et la redirection d'une ancienne clé gardent l'état de navigation.
- Tests :
  - `relations.test.tsx` (7) ;
  - `web10` (+1 : « Agrandir », puis Suivant et Retour) ;
  - `web12` et e2e `liens` adaptés (groupe « Relations ») ;
  - e2e `fiche.spec.ts` (+1 parcours, +1 test « depuis la recherche ») ;
  - API : `links.test`.
- Vérifications : Vitest web 377 sur 377, `tsc` web et API OK, e2e 38 sur 38.

## Reste à faire
Rien.

## Décisions et pièges
- Les relations n'affichent que la clé et le libellé du lien, sans le titre de l'autre ticket : celui-ci peut être à lecture restreinte (permissions par champ), et l'ajouter demanderait le filtrage côté API.
- Un type de lien créé dans un projet propage la suspicion par défaut (migration 035) : il tombe donc dans « Traçabilité ».
- e2e : `notifications.spec.ts` a échoué une fois (délai de 60 s) sous la suite complète. Il passe seul, puis dans la suite complète rejouée (38 sur 38) : échec intermittent, à surveiller, comme `web15`.
- Historique réécrit le 2026-11-10 à la demande de l'utilisateur : les 12 commits du lot 8 portent désormais `@gmail.com`. Sauvegarde : branche `backup/avant-reecriture-email`. Les commits de T-0112 ont changé de hachage (voir `T-0112/CONTEXT.md`).

## Commandes utiles
`cd apps/web && npx vitest run src/relations.test.tsx` ; `cd e2e && node global-setup.mjs && npx playwright test tests/fiche.spec.ts tests/liens.spec.ts`

## Prompt de reprise
Lire `docs/dev/STATE.md`, `docs/dev/tasks/LOT9-PLAN.md`, puis T-0114 (Board : carte enrichie, clic = panneau, filtre rapide dans l'URL, création par colonne, index `/p/:p/board`).
