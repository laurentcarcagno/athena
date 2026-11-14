# Journal de la tâche T-0138

## Fait
- API : 12 teintes en liste fermée (`hues.ts`) ; migration 056 (`status.color`, contrainte de liste) ; teinte à la création de tracker, à l'ajout de statut, et `PATCH /v1/projects/:p/trackers/:t/statuses/:s` (nom, catégorie, teinte, `null` = catégorie) ; `tracker.yaml` et reconstruction ; gabarits de tracker et de projet ; `statusColor` dans la recherche, le backlog, le board, la matrice, l'arbre ; `color` dans les compteurs de la vue d'ensemble.
- Thèmes : `hue.<teinte>.{bg,fg,border}` par mode dans chaque thème (dérivés de la palette du thème quand elle nomme la couleur, sinon de teintes de référence) ; Athena par `tools/hues.mjs` ; contrat : 36 jetons et 24 paires de plus.
- UI : `HUES`, `isHue`, `StatusPill` accepte `hue` (la teinte l'emporte sur la catégorie) ; 12 règles de style sur les jetons.
- Web : `lib/status.ts` (`statusPill`) ; pastilles de la recherche, de Mon travail, du tableau de bord, de la fiche, de l'arbre, du mini-workflow et des cartes du board ; `HueSelect` (pastille en aperçu, « Couleur de la catégorie » + 12 teintes) dans la configuration du tracker et dans le créateur de tracker.
- Vérifications : API 315/315 (suites concernées) et `status-color.test.ts` ; `@athena/ui` 52/52 ; web 445/445 ; e2e : teinte choisie, visible dans le tableau, effacée ; comparaison visuelle sans reprise de référence (sans teinte, rien ne change) ; suite complète (voir STATE).

## Reste à faire
- Rien. Suivante : T-0139 (palette de données, surface flottante, page de connexion).

## Décisions et pièges
- Une colonne du Board peut regrouper plusieurs statuts : son en-tête n'est pas teinté ; les cartes le sont.
- Les graphiques (barres empilées, burndown) restent par catégorie : leur palette relève de T-0139.
