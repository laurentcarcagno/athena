# T-0042 : filtres enregistrés et rôles par transition

- Migration 022 `saved_filter` (RLS), service, routes GET/POST/DELETE `/v1/projects/:p/filters`. Requête validée par le parseur ATQL ; personnel ou partagé.
- Interface liste : sélecteur de filtres, enregistrer (partagé optionnel), supprimer.
- Transitions : rôles autorisés saisis dans l éditeur, transitions masquées dans la fiche sans le rôle (le serveur reste l autorité).
