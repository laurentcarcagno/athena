# T-0122 : Tableau de bord configurable (Lot 9, I1)

Critère : disposition par défaut sans réglage ; masquer, réordonner, dupliquer, réinitialiser.

## Fait (2026-11-10)
- Migration 050 `dashboard_layout` (une ligne par personne et organisation, RLS) ; `core/dashboard.service.ts` (`DEFAULT_WIDGETS`, validation : ids uniques, ATQL valide, ≤ 24) ; `GET/PUT/DELETE /v1/me/dashboard` (tous rôles connectés, QA compris).
- ATQL : fonction `daysFromNow(n)` (0 à 3650) pour « Échéances de la semaine ».
- Widgets : `search` (ATQL + projets, vues enregistrées de T-0118), `mentions`, `approvals` (objets en attente de chaque projet), `favorites`, `recents`. Défaut : Mes tickets, À approuver, Mentions, Échéances de la semaine, Projets favoris, Récents.
- `components/Dashboard.tsx` : mode « Personnaliser » (monter, descendre, masquer, dupliquer les recherches, ajouter une vue enregistrée ou un widget masqué, réinitialiser avec confirmation) ; enregistrement à chaque changement. Monté dans Mon travail (`/me`), au-dessus de « À prendre » (conservé avec son action Prendre).
- Tests : API `dashboard.test.ts`, `atql.test.ts` ; web `Dashboard.test.tsx` ; e2e `tableau-de-bord.spec.ts`. Web 408/408, e2e 44/44.

## Pièges
- Le widget « À approuver » liste les jalons/baselines en attente (pas d'approbation de ticket à l'échelle de l'organisation).
- « Échéances » suppose le champ `due` (clé du gabarit standard) ; la requête se modifie en dupliquant et en enregistrant une vue.
- Lancer un spec e2e seul saute le `global-setup` : l'état de la base fait échouer `parcours`. Toujours `pnpm test`.

## Prompt de reprise
T-0123 (global : `/` = Mon travail, `/projets`, `/profil`, `/notifications`, `/org` → `/admin`, rail global ≤ 6, Vue d'ensemble du projet sur le moteur).
