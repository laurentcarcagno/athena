# T-0206 : fiche projet d une page (B23)

- Route `/p/:p/fiche` (`pages/project/ProjectSheetPage.tsx`) : santé, état du cycle de vie, avancement, retards, dates, sponsor, chef de projet, météo, phases et revues (dates, tenue, décision), cinq risques ouverts les plus critiques ; lien depuis la vue d ensemble. Composée des lectures habituelles : aucune dépendance serveur.
- Impression : `@page` A4 et feuille `@media print` (seul `.ath-sheet` reste visible), bouton « Imprimer la fiche ». Test : `ProjectSheetPage.test.tsx` (axe vert). Non vérifié : rendu réel de l impression (aperçu navigateur), à contrôler dans les e2e du lot.
