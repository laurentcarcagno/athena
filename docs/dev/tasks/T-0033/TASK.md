# T-0033 : permissions par champ
- Livre : readRoles/writeRoles par champ (absent = tous, athena-admin passe toujours) ; ecriture refusee (403) sans le role, creation et mise a jour comprises (la restauration passe par la mise a jour) ; lecture : champs retires des valeurs de lartefact, des resultats de recherche et des differences de lhistorique ; ATQL : filtre, tri ou IS EMPTY sur un champ non lisible refuse (pas de deduction par la requete) ; roles portes par tracker.yaml et restaures par le rebuild ; routes dajout de champ avec roles.
- Tests : 4 ; 258 API.
- Non fait : permissions par transition, par groupe Keycloak distinct des roles, masquage dans les titres de board et la palette de commandes, interface de saisie des roles dans leditaeur de tracker.
