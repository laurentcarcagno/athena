# Journal de la tâche T-0083

## Fait
- `GET /v1/projects/:p/docs/nodes/:uid/citations` (posé avec T-0081, `DocReadService.citations`) : artefacts citants, avec tracker, titre, état (nom et catégorie), lien suspect et origine ; `?source=` lève l'ambiguïté d'un UID présent dans deux sources.
- Visible dans la **liste** (plan du document : nombre de citations par exigence, et compteur du nœud) et dans le **panneau** de l'exigence (détail dépliable : artefact lié vers sa fiche, état, « Lien suspect »).
- **Droits** : seuls les artefacts que le lecteur peut lire (politique de la base) ; compteurs et détails respectent les listes d'ayants droit de tracker et de projet.
- Tests : `doc-read.test.ts` (citations, suspicion après ré-indexation, liste de tracker, liste de projet), `web23.test.tsx` (plan, compteur, panneau, axe).

## Écarts
- Aucun.
