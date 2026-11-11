# Journal de la tâche T-0151

## Fait
- Membres : « Ajouter un membre » (liste des comptes) et « Ajouter au projet » ; « Retirer… » sur chaque ligne demande confirmation (« Retirer User Dev du projet ? ») ; plus de bouton-icône seul. Les listes d'ayants droit et le contrôle export sont repliés sous « Accès restreint et contrôle export (avancé) ».
- Administration > Projets : nombre de projets et « + Nouveau projet », qui ouvre le formulaire de création (gabarit, version, criticité) avec « Annuler » ; tableau Projet, Clé, Chefs de projet (avec « Retirer »), et « Nommer un chef de projet… » sur la ligne, qui déplie le choix du compte.
- Tests : `members-panel.test.tsx` ; `web3`, `web4`, `web18` mis à jour ; e2e `parcours`, `audit`, `gabarits` (création à la demande) mis à jour.

## Décisions et pièges
- Le retrait d'un membre demande désormais confirmation (avant : aucune, au motif que c'est réversible) : l'accès cesse aussitôt, la revue l'a demandé.
