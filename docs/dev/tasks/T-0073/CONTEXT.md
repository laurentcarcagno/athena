# Journal de la tâche T-0073

## Fait
- `core/templates/` : `common.ts` (aides de construction), `spatial.ts`, `defense.ts`, `index.ts` (`BUILTIN_NORMATIVE`). Gabarit **Spatial** en versions 1.0 et 1.1 : ECSS-E-ST-40C Rev.1 et ECSS-Q-ST-80C Rev.2, catégories A à D, revues SRR, PDR, CDR, QR, AR (+ TRR, TRB), phases avec critères de sortie « tous les RID de la revue sont clos », livrables RB, TS, DDF, DJF, MGT, PAF, MF, OP et dossier Sécurité, 11 trackers (NORM, SYS, SRS, ICD, SDD, VER, SPR, NCR, CR, RFD, RID), règles « exigence logicielle tracée vers la RB » et « vérifiée ».
- La version 1.1 sert de jeu de test de montée : champ `safety_relevant` sur SRS, état « Différée » sur NCR, règle `sw-req-designed`.
- Paramètres `code-coverage` et `branch-coverage` par catégorie : présents, **tous vides** (aucune valeur imposée).
- Les gabarits livrés sont en lecture seule (modifier, publier, supprimer : refusé, « créez un dérivé »), listés avec leurs versions, utilisables comme parent.
- `TemplateTrackerSchema` déplacé dans `template-tracker.ts` (évite un cycle d'import).
- Critère de phase `tracker_status` avec filtre `where {field, value}` (RID d'une revue donnée).
- Nouveau type de lien livré `concerns` (« concerne ») ; les tests de la liste des types livrés sont mis à jour.
- Guide utilisateur : section « Gabarits normatifs ».

## Sources consultées
ECSS (ecss.nl) : ECSS-E-ST-40C Rev.1 et ECSS-Q-ST-80C Rev.2 (30 avril 2025). Les catégories A à D et les revues viennent de la spécification `SPEC_IHM.md` ; le texte intégral des normes n'est pas reproduit (les clauses s'importent par CSV).

## Écarts
- Aucun. Les seuils de couverture de code restent à fixer avec l'assurance produit (demandé par la fiche).
