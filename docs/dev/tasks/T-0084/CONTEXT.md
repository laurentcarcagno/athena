# Journal de la tâche T-0084

## Fait
- `DocRefPicker.tsx` dans l'onglet Liens de la fiche : liste des exigences citées (UID en mono, titre, suspect, absente, lien « Ouvrir dans le document » à l'ancre `#UID`), **sélecteur à autocomplétion par UID ou titre** (recherche de l'API, exigences déjà citées écartées), acquittement d'un lien suspect. Fonctionne sur **tout tracker** (action de sprint comprise) : le mécanisme `doc_link` existant, sans nouveau champ (le type de champ `sdocRef` de la fiche n'est pas nécessaire, la citation passe par le lien).
- API : `DocLinkView` porte `source` et `docId` ; route d'acquittement `POST .../artifacts/:key/doc-links/:source/:uid/acknowledge` (audit `doc.acknowledge` au nom de l'utilisateur).
- **Suspicion** : la ré-indexation d'un document modifié rend suspects les liens des exigences changées ou disparues et émet **un événement `link.suspect` par lien** ; un abonnement webhook sur ce type reçoit une livraison par lien.
- Tests : `doc-read.test.ts` (webhook `link.suspect` livré, ordre déterministe, vue des liens avec source), `web24.test.tsx` (sélecteur, citation, suspect, orphelin, acquittement, axe), **e2e `sprint-doc.spec.ts` : le critère de sortie du Lot 5** (une action de sprint cite une exigence de l'URD, l'exigence est modifiée et ré-indexée, le lien devient suspect dans la fiche et dans le document, un humain l'acquitte). e2e : 25 sur 25.

## Écarts
- Aucun.
