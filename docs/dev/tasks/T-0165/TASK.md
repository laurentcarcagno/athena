# T-0165 : vues du planning, panneau de détail, ATQL

- **Objectif** : onglets Gantt / Board / Liste / Versions sur le même périmètre (filtres dans l'adresse) ; Liste avec début, fin, marge ; section Planification de la fiche et du panneau de détail ; ATQL `late()`, `critical()`, champ `startDate`.
- **Critères d'acceptation** (testables) : tests ATQL ; tests web par rôle ; filtre conservé d'un onglet à l'autre.
- **Fichiers concernés** : `atql/{parser,compile,search.service}.ts`, `pages/PlanningPage.tsx`, `components/PlanningViews.tsx`, `components/PlanningSection.tsx`, `pages/ArtifactPage.tsx`.
- **Dépendances** : T-0164.
