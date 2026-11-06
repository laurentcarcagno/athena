# Journal de la tâche T-0053

## Fait
- API : `GET /v1/projects/:p/modules` (`ProjectOverviewService`, `ProjectOverviewController`) : ordre fixe, modules toujours présents (aperçu, trackers, planification, activité, membres) et modules selon les données (types de liens, source documentaire, dépôt de code).
- Web : `ProjectShell` (barre d'onglets en liens, `aria-current`), `visibleTabs` (module actif ET page existante), registre `IMPLEMENTED_TABS` (aujourd'hui : Vue d'ensemble = tableau de bord, Planification = gestion de projet).
- Routes : `/p/:projet` (aperçu), `/p/:projet/planification`, `/p/:projet/recherche` (ancienne liste ATQL) ; redirections `/p/:projet?q=…` → recherche, `/manage` → planification, `/dashboard` → aperçu. Rail : Vue d'ensemble et Recherche remplacent Recherche, Tableau de bord et Gestion de projet. Palette et liens internes mis à jour.
- Tests : `project-overview.test.ts`, `web9.test.tsx` (ordre, masquage, repli, clavier, axe, redirections) ; web2/web3 adaptés.

## Reste à faire
- Pages des onglets Trackers (T-0054), Activité, Membres, Code (T-0055), Traçabilité (T-0068), Documents (T-0082) : à ajouter à `IMPLEMENTED_TABS`.
- Les pages d'onglets gardent leur en-tête actuel (deux titres ne s'empilent pas : la coquille n'a que la barre d'onglets) ; le fil d'Ariane arrive avec T-0061.

## Décisions et pièges
- Un module « actif » ne dépend pas du rôle : le dépôt de code, la source documentaire et les types de liens se configurent depuis l'API ou l'Administration, hors onglet.
- Si `/modules` échoue, les onglets existants s'affichent (repli).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0054 (Vue d'ensemble et Trackers).
