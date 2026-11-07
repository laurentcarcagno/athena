# T-0091 : Notifications et abonnements

- **Lot** : 7 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Centre de notifications, abonnement par item, vue ou tracker, réglage par événement.
- **Fichiers concernés** :
  - `apps/api/src/db/migrations/044_notifications.sql`
  - `apps/api/src/notify/*`
  - `apps/web/src/components/NotificationCenter.tsx`
- **Migration** : 044 (la 040 était déjà prise) : `subscription`, `notification`, `notification_pref` (RLS forcée, `org_isolation`).
- **Critères d'acceptation** (testables) :
  - Événements : transition, mention, lien suspect, commentaire
  - Les notifications respectent droits et ayants droit
  - Centre dans la barre supérieure, lecture/non-lecture, accessible au clavier
- **Tests à écrire** :
  - API : abonnements, génération, droits
  - Vitest/RTL
  - axe + Playwright
- **Règles communes** : interface Hemeria (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : fin du Lot 5
