# T-0159 : modèle de planification

- **Objectif** : rôles sémantiques `start_date`, `progress`, `remaining` ; type de lien d'organisation « précède » (fin → début) avec décalage en jours ouvrés et refus des cycles ; prise en compte dans `tracker.yaml`, les gabarits et la démonstration NOVA.
- **Critères d'acceptation** (testables) : rôle refusé sur un champ de mauvais type ; lien créant un cycle → 422 ; reconstruction depuis `tracker.yaml` conserve les rôles ; NOVA de `dev-start` avec dates, durées et liens « précède ».
- **Fichiers concernés** : `apps/api/src/db/migrations/058_*.sql`, `apps/api/src/core/link-types.ts`, `apps/api/src/core/link.service.ts`, `apps/api/src/core/templates/*`, `tools/dev-start.mjs`.
- **Hors périmètre** : calendrier (T-0160), calcul des dates (T-0161), interface.
- **Dépendances** : T-0158.
