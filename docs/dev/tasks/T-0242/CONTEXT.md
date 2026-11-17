# T-0242 : interface de la gouvernance V2 (B38)

- `components/DecisionsPanel.tsx` sur la page du portefeuille : centre d alertes (cause en toutes lettres, depuis quand, résolution automatique dite), journal des décisions filtrable, enregistrement (PMO, administrateur) avec transition proposée non appliquée, application de l avenant (finance, administrateur). Tests : `DecisionsPanel.test.tsx`.
- Non fait : interface de marquage d un projet de pilotage (API : `PUT /portfolios/:k/projects/:p` avec `kind` et `purpose`) ; exposition aux risques dans le temps (barres empilées par instantané) ; trajectoire d un risque.
