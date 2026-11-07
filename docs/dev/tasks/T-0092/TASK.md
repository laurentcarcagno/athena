# T-0092 : Résumé quotidien par courriel

- **Lot** : 7 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Un courriel par jour regroupant les notifications, au lieu d'un par modification.
- **Fichiers concernés** :
  - `apps/api/src/notify/digest.ts`
  - `apps/api/src/workers/*`
  - `deploy/helm/athena/values.yaml`  (SMTP interne)
- **Migration** : 045 (réglage par personne et suivi des envois)
- **Critères d'acceptation** (testables) :
  - Planifié via les déclencheurs planifiés existants, heure par utilisateur
  - Aucun contenu hors droits ; liens canoniques
  - SMTP interne configurable, désactivable (réseau isolé)
- **Tests à écrire** :
  - API : composition du résumé, désactivation
  - Test de non-sortie (T-0077)
- **Règles communes** : interface Hemeria (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0091
