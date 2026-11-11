# Journal de la tâche T-0152

## Fait
- Projets : une carte par projet (nom, clé, « 3 trackers : Bugs (6), Exigences (6), Tâches (6) », tickets ouverts, boards, « Ouvrir », étoile de favori, « Ajouter un tracker » pour l'administrateur). Les attributs d'un tracker restent consultables en info-bulle sur son nom (lot 8). Plus de colonne à triangle ni de dépliage.
- Microcopie : étiquettes de page « Mission console » (Projets) et « Traitement » (Mon travail) retirées du rendu et du dictionnaire ; état de version traduit sur l'Avancement (« Planifiée », « Publiée » au lieu de « planned », « released »). Les états vides avec action ont été traités tâche par tâche (automatisations, sprints à venir, accès réservé, informations clés).
- Test de vocabulaire : aucun état ni étiquette en anglais dans les textes français (`planned`, `released`, `nothing here`, `mission console`, `query mode`, `filter mode`).
- Tests : web 468/468 ; e2e `parcours`, `navigation`, `notifications`, `approbation` verts.

## Décisions et pièges
- Une regex contenant `\b` écrite par une commande shell devient un caractère 0x08 : écrire ces lignes par un script à `String.raw` ou par l'outil d'édition.
