# T-0120 : Paramètres du projet et redirections (Lot 9, H1)

Critère : toute ancienne URL mène à la nouvelle page ; aucune page de projet ne règle un objet global.

## Fait (2026-11-10)
- `pages/SettingsPage.tsx` : `/p/:p/parametres` (première section autorisée), `/parametres/:s`, `/parametres/trackers/:t` (configuration du tracker, `TrackerConfigPage`). Sections, dans l'ordre de l'ADR-0003 : Membres, Trackers, Boards, Automatisations, Baselines, Approbations ; liens de sous-navigation (`aria-current`).
- Droits (`SETTINGS_SECTIONS` dans `lib/navigation.ts`, source unique) : Membres, Boards, Baselines = administrateurs et chefs de projet ; Trackers, Automatisations = administrateurs ; Approbations = administrateurs, chefs de projet, assurance qualité. Aucun rôle autorisé : message, aucun appel réseau.
- Rail : section « Paramètres » (`settings`) ; Planification, Membres et Administration du projet disparaissent du rail.
- Redirections permanentes (`App.tsx`) : `/manage` et `/planification` → `/parametres`, `/membres` → `/parametres/membres`, `/admin` → `/parametres/automatisations`, `/trackers/:t/config` → `/parametres/trackers/:t`. Liens internes mis à jour (écran Tracker, liste, création de tracker).
- Objets globaux : les webhooks passent dans l'Administration de l'organisation (`/org`, onglet Webhooks) ; les plugins y étaient déjà. `AdminPage.tsx` devient `SettingsPanels.tsx` (Webhooks, Automatisations, création de baseline), `ProjectManagePage.tsx` ne garde que les panneaux Acteurs et Boards (sprints et versions : Backlog et Roadmap), `MembersTab.tsx` exporte `MembersPanel`.
- Baselines : une seule liste (`BaselineCompare`) ; la création reste aux administrateurs.
- Rail : la configuration d'un tracker signale toujours le tracker (critère de T-0109), à l'ancienne adresse comme à la nouvelle.
- Tests : `navigation.test.ts`, `web9` (redirections, rôles, rail), `audit-followup`, `web2`, `web3`, `web5`, `web6`, `web10`, `web20`, `web22`, `Breadcrumb` ; e2e `audit.spec` (pages nouvelles balayées par axe, refus de `/p/ARI/admin` pour un utilisateur) et `parcours.spec` (`/membres` redirigé).

## Pièges
- Bash : un heredoc Python long contenant `’` et des barres obliques a été refusé par le shell ; écrire le script dans le scratchpad et l'exécuter.
- Séparer deux tâches mêlées dans les mêmes fichiers : écrire dans l'index la version de la première (`git hash-object -w --stdin --path=…` puis `git update-index --cacheinfo`), la vérifier dans un worktree temporaire, committer.

## Prompt de reprise
T-0121 (Rapports et redirections).
