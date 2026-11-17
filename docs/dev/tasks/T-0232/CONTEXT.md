# T-0232 : dépendances entre projets (B36)

- Migration 079 `project_dependency` (ticket prédécesseur, ticket successeur de deux projets différents, décalage en jours ouvrés ; politique `acl_link_ok` : le lien suit la visibilité des deux tickets). `ppm/dependency.service.ts` : ajout (refus : même projet, cycle, ticket inconnu), retrait, graphe et matrice par portefeuille, marge en jours ouvrés (négative = contrainte violée), propagation en lecture seule (deux passes : positions sans glissement puis avec glissement, l impact est la différence ; les violations déjà présentes sont absorbées). Routes `GET /v1/portfolios/:k/dependencies`, `POST|DELETE /v1/dependencies`, `POST /v1/dependencies/propagate` (écriture : admin et PMO).
- Web : `DependenciesPanel` (matrice, liens, ajout, propagation) sur la page du portefeuille.
- Écart justifié : le prédécesseur externe n est pas injecté comme contrainte de date dans le moteur de dates de chaque projet ; seul le calcul de portefeuille le lit.
- Tests : `ppm/dependency.test.ts`, `DependenciesPanel.test.tsx`.
