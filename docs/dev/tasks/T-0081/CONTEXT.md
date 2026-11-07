# Journal de la tâche T-0081

## Fait
- Migration **043** (la fiche disait 039) : `doc_node` gagne `doc_id`, `doc_path`, `position`, `parent_uid`, `depth`, `synthetic` et un index plein texte (`search_tsv`, GIN) ; `doc_source` retient dépôt, référence et sous-dossier (lien vers la source, détection d'un index en retard) ; table `baseline_doc_node` (utilisée par T-0085).
- `sdoc-parser.ts` : `parseSdocTree` (ordre de lecture, profondeur, section parente ; sections et textes sans UID reçoivent un UID synthétique `~<doc>:<position>`), `parseSdoc` inchangé pour les nœuds à UID, `docIdOf` (`<source>.<chemin>`), `sanitizeDocText`.
- `DocLinkService.index` : **ré-indexation incrémentale** (seuls les nœuds nouveaux ou modifiés sont écrits, les disparus supprimés, résultat `written` et `removed`), provenance de la source, événement `link.suspect` par lien rendu suspect (en plus de `doc.links_suspected`).
- `DocReadService` + `DocController` (lecture seule) : `GET /v1/projects/:p/docs` (documents), `.../docs/:doc/tree` (arborescence ordonnée avec nombre de citations), `.../docs/search?q=&doc=` (UID exact, préfixe, plein texte, jokers LIKE neutralisés), `.../docs/nodes/:uid` et `.../docs/nodes/:uid/citations` (artefacts citants avec état et lien suspect), `POST .../artifacts/:key/doc-links/:source/:uid/acknowledge` (acquittement audité).
- Énoncés assainis avant renvoi : balises, scripts, gestionnaires d'événements, commentaires HTML, schémas `javascript:` et caractères de contrôle retirés ; le client affiche le résultat comme du texte (même principe que les commentaires, qui sont du texte rendu sans HTML).
- Droits et listes d'ayants droit : ceux de la base (RLS) ; testé avec un non-membre.
- Tests : `doc-read.test.ts` (12), `docs.test.ts` adapté.

## Décisions
- Identifiant de document `<source>.<chemin-slug>` (unique par projet, sûr dans une URL).
- L'API de citations (T-0083) et l'événement `link.suspect` et l'acquittement (T-0084) sont posés ici côté API ; leurs interfaces suivent.

## Écarts
- Aucun.
