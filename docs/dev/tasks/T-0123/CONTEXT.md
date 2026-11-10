# T-0123 : Global (Lot 9, I2)

Critère : rail global ≤ 6 entrées ; redirections testées ; Vue d'ensemble du projet sur le moteur.

## Fait (2026-11-10)
- Adresses : `/` = Mon travail (`HomeRoute`), `/projets`, `/profil`, `/notifications`, `/admin` ; redirections `/me` → `/`, `/org` → `/admin`. Barre basse mobile et liens internes mis à jour.
- Rail global : Favoris, Récents, Projets, Mon travail, Recherche, Administration (administrateur) = 6 au plus. Profil et Aide sont des icônes au bas du rail, avec l'utilisateur.
- `ProfilePage` : langue, thème, page d'accueil (Mon travail ou Projets, `lib/home.ts`, par navigateur), notifications. `NotificationSettings` extrait du panneau de notifications et partagé. `NotificationsPage` : liste complète.
- Migration 051 : `dashboard_layout.scope` ('' = accueil, clé de projet = Vue d'ensemble) ; `?project=` sur `/v1/me/dashboard` ; widget `trackers`. `OverviewTab` = `Dashboard project=…` (Mes tickets, Échéances, Trackers, Mentions du projet) + carte du gabarit + avancement.
- Tests : API `dashboard.test.ts` ; web `global-nav.test.tsx`, `web3`, `web6`, `web9`, `web11`, `create-flow` ; e2e : les specs qui lisaient la liste des projets sur `/` vont à `/projets`. Web 415 environ, e2e 44/44.

## Pièges
- La page d'accueil, la langue et le thème sont enregistrés sur le compte (migration 052, `/v1/me/preferences`, ajoutée après la vérification du lot) ; copie locale pour l'affichage immédiat.
- `web15`, `web16` instables sous charge (déjà signalé).

## Prompt de reprise
T-0124 (glossaire : Ticket, Version, Gabarit ; test de vocabulaire ; `docs/user`).
