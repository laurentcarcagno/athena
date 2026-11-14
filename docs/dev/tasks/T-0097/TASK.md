# T-0097 : Types de tracker d'organisation (API et données)

- **Lot** : 1 (premier de la liste du lot, avant T-0053 ; décision du 2026-11-06 : on introduit les types)
- **Objectif** : définir au niveau de l'organisation des types de tracker (Exigence, Anomalie, Tâche, Test, Risque, Interface, Conception, Action, Décision, Revue…), chacun avec sa catégorie (Ingénierie, Développement, Vérification, Pilotage), les vues proposées et le socle de champs. Chaque tracker dérive d'un type. Les paires de liens (T-0063) et la carte des trackers (T-0054) s'appuient sur les types.
- **Fichiers concernés** :
  - `apps/api/src/db/migrations/031_tracker_types.sql` (numéro = prochain libre à l'exécution)
  - `apps/api/src/core/tracker-type.service.ts`, `tracker-type.controller.ts`, `tracker.service.ts`, `template.service.ts`, `templates.ts`
- **Migration** : `tracker_type` (organization_id, key, name, category, default_views jsonb, base_fields jsonb, RLS forcée, `org_isolation`, droits `athena_app`) ; `tracker.type_key` nullable (les trackers existants restent sans type, catégorie « Autres », rien ne casse) ; types livrés insérés par organisation à la migration.
- **Critères d'acceptation** (testables) :
  - Les types livrés existent après migration ; un administrateur en crée, modifie, supprime (refus s'il est utilisé)
  - Créer un tracker demande un type (facultatif pour compatibilité) ; les champs du socle du type sont proposés
  - Un tracker sans type fonctionne comme avant ; la catégorie vient du type, sinon « Autres »
  - Les templates de tracker et de projet portent le type ; `tracker.yaml` l'exporte
  - Les vues proposées (Board, Arbre, Matrice, Timeline…) découlent du type
- **Tests à écrire** :
  - API : CRUD, RLS entre organisations, suppression refusée, migration d'un jeu de trackers existants
  - Historique : aller-retour YAML ; axe
- **Règles communes** : interface Athena (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : interface d'administration et choix du type dans le constructeur (T-0100) ; héritage de socle de champs imposé aux projets (Lot 3).
- **Dépendances** : T-0052
