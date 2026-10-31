# T-0004 : persistance PostgreSQL (phase 1/2)
- Objectif : migrations SQL contrôlées par somme de contrôle ; noyau (organisation, projet, trackers multiples, champs, statuts, transitions, types de lien) ; artefacts, révisions, liens, commentaires ; outbox ; audit chaîné ; RLS forcée.
- Critères : 9 tests d'intégration verts (isolation RLS, plusieurs trackers par projet, clés uniques, numérotation sans doublon sous concurrence, audit chaîné et immuable).
- Statut : terminé. Le rôle `athena_app` est un rôle de groupe sans connexion : en exploitation, OpenBao (moteur database) crée les comptes et fait `GRANT athena_app`.
- Suite : T-0005 dépôt (repository) et services du noyau (tracker, artefact, workflow) avec validation par schéma.
