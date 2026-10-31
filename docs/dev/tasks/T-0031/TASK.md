# T-0031 : livraison (deploiements, retroportages, DORA, notes de version)
- Livre : evenements GitLab de deploiement (date et environnement sur la MR fusionnee dont le SHA correspond ; transition configurable en production, le workflow reste maitre, un deploiement sans identite autorisee ne contourne rien) ; fusion memorisee (SHA, date, branche cible) ; retroportages par branche release/<version> avec solde automatique a la fusion, abandon audite, validateur de workflow backports_done ; indicateurs DORA (frequence, delai de livraison median, taux dechec par commits Reverts, temps de retablissement des incidents) ; notes de version Markdown deterministes ; routes REST.
- Approximations documentees : taux dechec = artefacts deployes ayant ensuite un commit Reverts ; MTTR = creation a derniere mise a jour des incidents resolus.
- Tests : 5 + 1 REST ; 254 API. Defaut corrige en cours de route : import de type empechant linjection NestJS.
- Non fait : CLI athena et job CI athena-check.
