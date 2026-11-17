# T-0191 : cycle de vie configurable, côté API (B11)

- Migration **068** : `project.lifecycle_state` (défaut `in_progress`, donc les projets existants sont migrés), `project_lifecycle_state`, `project_lifecycle_transition`, `project_lifecycle_history` (ajout seul : seuls `select` et `insert` sont accordés).
- Les treize états livrés et leurs transitions sont dans le code (`ppm/lifecycle.ts`). Une organisation sans ligne les utilise ; `PUT /v1/admin/lifecycle` enregistre la liste complète (états et transitions), `DELETE` revient aux états livrés. Le code ne lit que la catégorie. Un état courant d'un projet ne peut pas disparaître (on le masque) ; chaque catégorie garde au moins un état.
- `GET /v1/lifecycle`, `GET /v1/projects/:p/lifecycle` (état, transitions sortantes avec la permission de l'appelant, historique), `POST /v1/projects/:p/lifecycle/transition` (409 transition non permise, 403 droit insuffisant, 422 motif manquant vers une catégorie `cancelled`). Droits : l'administrateur toujours ; le PMO et le chef désigné selon `roles` de la transition.
- Non fait : lecture seule des projets `archived`, alerte des états suspendus trop longs, filtrage des vues par catégorie : ils viennent avec les consommateurs (santé du portefeuille, I1).
- Suite : T-0192 (Administration › Cycle de vie, action de transition dans le projet).
