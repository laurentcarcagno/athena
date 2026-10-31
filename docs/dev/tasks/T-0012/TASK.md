# T-0012 : liaison StrictDoc (phase 6 bis, anticipee)
- Livre : analyseur .sdoc en lecture seule (UID, champs multilignes, relations Parent, champ ATHENA_REFS), index par source, liens artefact-exigence crees depuis Athena ou depuis ATHENA_REFS, liens suspects par empreinte de contenu (modification ou disparition), acquittement, orphelins, rapport de couverture.
- Verifie sur les vraies exigences de C:/projects/AI/STRICTDOC/docs (plus de 200, UID uniques).
- Tests : 10 (109 au total pour lAPI).
- Non fait : recuperation des fichiers depuis GitLab par webhook push, routes REST, report des references dans le .sdoc par merge request, champ sdocRef et onglet dans linterface, baselines couplees, isolation du lecteur en conteneur.
