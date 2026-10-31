# T-0041 : modification et suppression de champs

- API : PATCH/DELETE `/v1/projects/:p/trackers/:t/fields/:f` (purge explicite). Clé et type immuables. Titre non supprimable.
- Interface : rôles à l ajout, colonne rôles, suppression avec confirmation de purge.
- Limite : les fichiers YAML des artefacts dans Git ne sont réécrits qu à leur prochaine modification.
