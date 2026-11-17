# T-0221 : revue de portefeuille et dossier imprimable (B33)

- `ppm/review.service.ts` : création d une revue (fige un instantané « revue »), liste, modification (brouillon seulement : une revue tenue n est plus modifiable), dossier (revue + instantané figé, lignes visibles du lecteur). Routes `GET|POST /v1/portfolios/:k/reviews`, `GET|PATCH …/reviews/:id` (écriture : admin et PMO).
- Web : section Revues dans `SnapshotPanel` (création, passage à tenue, lien), page `/portefeuilles/:clé/revues/:id` (`ReviewDossierPage`) : compte rendu, vue direction, tableau de santé, une section et une page imprimée par projet critique ; impression par `@media print` (`.ath-sheet`, `.ath-sheet-page`).
- Tests : `ppm/snapshot.test.ts` (dossier immuable, aucune trace d un projet masqué), `ReviewDossierPage.test.tsx`, `SnapshotPanel.test.tsx`.
