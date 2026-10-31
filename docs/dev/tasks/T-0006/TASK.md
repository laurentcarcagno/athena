# T-0006 : API REST du noyau (phase 2)
- Objectif : routes projets, trackers, artefacts, transitions ; organisation déduite du groupe Keycloak `/org-<clé>` ; erreurs de domaine et PostgreSQL converties en 403/404/409/422 ; corps validés par zod.
- Critères : 5 tests HTTP verts (401/403, validation, parcours complet, 409 sur version périmée et clé en double, isolation entre organisations).
- Limites connues : autorisation au niveau organisation et rôle global seulement (pas encore de membres de projet ni de permissions par champ) ; pas d'OpenAPI généré ; pas de pagination (aucune route de liste).
