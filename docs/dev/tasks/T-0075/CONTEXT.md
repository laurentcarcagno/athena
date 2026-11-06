# Journal de la tâche T-0075

## Fait
- API : `TemplateUpgradeService.status` expose `phaseCheck` (critères de sortie de la phase courante, items restants) ; `advancePhase` (`POST /v1/projects/:p/template/phase/advance`, administrateurs et chefs de projet) ne passe à la phase suivante que si les critères sont remplis (« RID clos avant clôture de revue »).
- Création de projet (Organisation) : choix du gabarit, de sa version et de la catégorie de criticité.
- `NormativeTemplateEditor.tsx` : éditeur en 7 étapes (parent et identité, référentiel, criticité, trackers avec **aperçu en direct du formulaire d'item**, phases/revues/livrables, règles et seuils par catégorie, publication), validation de chaque étape avant la suivante (`stepProblems`), enregistrement du brouillon, publication. Bouton « Dériver » sur les gabarits livrés, « Modifier par étapes » sur les autres, « Nouveau gabarit normatif ».
- `ProjectTemplateCard.tsx` dans la Vue d'ensemble : version du gabarit, criticité, phase en cours et critères, **dérive** (trackers, champs, états, transitions ajoutés), passage de phase, aperçu et application de la montée (`UpgradeReport`).
- Les seuils de couverture par catégorie se saisissent à l'étape 6 (cases vides = aucun seuil), sont envoyés au gabarit et versionnés avec lui.
- Tests : `web18.test.tsx` (9, dont axe sur l'éditeur et la carte), 1 test API de phase, `e2e/tests/gabarits.spec.ts` (3 : projet Spatial puis conformité et tailoring, projet Défense, dérivation jusqu'à la publication). e2e : 21 sur 21.

## Décisions
- Le passage de phase n'est contrôlé que par les critères `tracker_status` ; les critères manuels sont affichés « À vérifier » et ne bloquent pas.
- Les gabarits livrés ne se modifient pas : l'interface propose de les dériver.

## Écarts
- Aucun.
