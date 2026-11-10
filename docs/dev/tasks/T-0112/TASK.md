# T-0112 : fiche, en-tête complet et onglet dans l'URL (Lot 9, C1)

Plan : `docs/dev/tasks/LOT9-PLAN.md`. Spécification : `docs/dev/SPEC_IHM.md` § « Vue Item ».

## Objet
1. Découper `apps/web/src/pages/ArtifactPage.tsx` : l'en-tête (panneau et page), les transitions, l'abonnement et l'épingle passent dans `components/ItemHeader.tsx`, sans changement de comportement.
2. En-tête complet : responsable, priorité, échéance, version, sprint, parent, blocage, dans le panneau comme sur la page.
3. Onglet actif dans l'URL : `?onglet=details|links|history|attachments|activity|dev|approval`.

## Décisions
- Priorité et version : deux nouveaux rôles sémantiques, `priority` et `version` (migration 047, contrainte de `field_definition.semantic_role`). L'en-tête affiche le libellé du champ qui porte le rôle (« Sévérité » pour les anomalies, « Priorité » pour les exigences). Les gabarits livrés posent `priority` sur `severity` et `priority`, `version` sur `fixed_version`.
- Sprint : route `GET /v1/projects/:p/artifacts/:clé/sprint`, qui rend le sprint non clos du ticket (un seul possible, règle de `SprintService.addItem`) ou `null`.
- Parent : lien sortant d'un type hiérarchique (l'enfant pointe vers le parent, comme la vue Arbre). `LinkView` porte désormais `hierarchical`.
- Blocage : liens entrants du type `blocks` (« est bloqué par »).
- Information absente : « — ». La grille de l'en-tête reste identique d'un ticket à l'autre ; un tracker sans champ de ce rôle affiche aussi « — ».
- Onglet : `details` est la valeur par défaut et n'apparaît pas dans l'URL. Changer d'onglet ajoute une entrée d'historique (Précédent restaure l'onglet). Valeur inconnue, ou `approval` sans circuit : Détails. Les autres paramètres (`?i=` du panneau, filtres) sont conservés. J/K dans le panneau gardent l'onglet. Changer de ticket par un lien remet l'onglet à Détails (l'adresse n'a pas d'`onglet`).
- Raccourci `L` : passe l'URL sur `?onglet=links` et place le focus sur la création d'un lien.

## Critères d'acceptation (testables)
- [x] `?onglet=history` ouvre la fiche sur l'Historique ; cliquer « Liens » met `onglet=links` dans l'URL ; Précédent revient sur l'Historique.
- [x] `L` met `onglet=links` dans l'URL.
- [x] Dans le panneau de l'écran Tracker, `?i=` et `onglet` cohabitent ; J/K gardent l'onglet.
- [x] L'en-tête (page et panneau) montre responsable, priorité, échéance, version, sprint, parent et blocage sans clic ; une information absente vaut « — ».
- [x] API : `GET .../sprint` rend le sprint non clos ou `null` ; `LinkView.hierarchical` ; les rôles `priority` et `version` sont acceptés.
- [x] Tests existants verts (`web`, `web2`, `web7`, `web12`, e2e `parcours`, `liens`, `approbation`, `navigation`).
