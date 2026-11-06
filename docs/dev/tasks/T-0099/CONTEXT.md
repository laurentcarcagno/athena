# Journal de la tâche T-0099

## Fait
- Migration **040** : `artifact.export_control` (ITAR, EAR, dual_use ; nul = aucun) avec index partiel ; table `export_control_member` (ayants droit du marquage par projet, RLS forcée) ; `webhook_endpoint.export_control_ok` ; colonnes de portée recopiées sur `artifact_link` (trigger) pour que la politique des liens n'ait plus de sous-requête.
- **Filtrage par la base** : la politique restrictive de `artifact` ajoute « item non marqué, ou sujet ayant droit du marquage du projet » (`acl_item_ok`), via un refus calculé par transaction (`app.denied_export`, projets ayant des items marqués dont le sujet n'est pas ayant droit). Recherche, ATQL, compteurs, couverture et exports excluent donc l'item ; commentaires, révisions et pièces jointes de l'item suivent.
- **Liens** : visibles dès que la portée (projet, tracker) des deux extrémités l'est ; `LinkService.list` renvoie `other: null, restricted: true` pour l'extrémité sous contrôle export, affichée « lien vers un item sous contrôle export » sans clé, titre ni contenu.
- **Webhooks sortants** : les événements d'un item marqué (ou citant sa clé) ne partent que vers les abonnements déclarés habilités (`exportControlOk`) ; les autres ne reçoivent rien, pas même un événement masqué.
- `AccessService` : `exportMembers`, `setExportMembers` (refuse de vider la liste tant que des items sont marqués), `setMarking` (version, révision, événement `artifact.marking_changed`, audit ; marquer exige des ayants droit). Routes `GET/PUT /v1/projects/:p/export-control` et `PUT /v1/projects/:p/artifacts/:key/marking` (administrateurs et chefs de projet).
- Interface : `MarkingEditor` (fiche item, confirmation, lecture seule pour les autres rôles), `ExportControlMembers` (onglet Membres), affichage des liens restreints.
- Tests : `export-control.test.ts` (7 : ayants droit requis, marquage versionné et audité, visibilité lecture/recherche/compteurs/couverture, liens, webhooks habilités ou non, démarquage), `web21.test.tsx` (5 dont axe).

## Décisions
- Un administrateur d'organisation non ayant droit ne lit pas un item marqué (même règle que pour les listes).
- Les événements d'un item marqué sont exclus (et non masqués) des abonnements non habilités : un événement masqué révélerait quand même qu'un item sensible a changé.
- L'historique GitLab (instance interne) reçoit tous les items : le contrôle d'accès du dépôt d'historique relève du GitLab de l'instance.

## Écarts
- Aucun.
