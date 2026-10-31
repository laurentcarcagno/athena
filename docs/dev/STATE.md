# État du projet

Dernière mise à jour : 2026-10-31

- **Phase** : 0/1 (fondations et socle).
- **Fait** : T-0001 monorepo + jetons Hemeria + lint design ; T-0003 API NestJS + auth Keycloak (testée contre le Keycloak de dev).
- **Tâche en cours** : aucune.
- **Prochain pas** : T-0004 persistance PostgreSQL (migrations, RLS, tables organisation/projet/tracker/artefact, outbox) ; puis intégration OpenBao (`@athena/secrets`), BFF/sessions, composants `@athena/ui`.
- **Blocages** : relevés d'environnement (plan § 23.2 point 6). Accès SSH à gitlab.karka.lan non testé ; rien n'a été poussé.
- **Rappel** : le plan complet représente ~58 semaines ; il avance par tâches de taille session. Voir `ATHENA_PLAN_DEVELOPPEMENT.md` § 20.
