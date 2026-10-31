# T-0013 : interaction avec les depots de code GitLab (phase 7, lot 1 et debut du lot 2)
- Livre : extraction des cles et mots-cles (Refs, Fixes, Closes, Implements, Reverts) dans commits, MR et branches ; liens code_ref (commit, branche, MR) ; etat de pipeline ; transitions automatiques (demarrage, revue, resolution a la fusion) faites au nom de lutilisateur mappe par e-mail avec le role minimal ; les validateurs et conditions du workflow restent appliques ; idempotence ; generateur de nom de branche.
- Constat de test : une MR deja connue sautait ses transitions a la fusion ; corrige.
- Tests : 10 (119 au total pour lAPI).
- Non fait : reception HTTP des webhooks GitLab (jeton secret en temps constant, liste dadresses), reconciliation periodique, creation de branche/MR depuis Athena, retroportages, DORA, notes de version, CLI athena, job CI athena-check, transition sur deploiement et revert.
