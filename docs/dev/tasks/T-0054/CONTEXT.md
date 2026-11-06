# Journal de la tâche T-0054

## Fait
- API : `GET /v1/projects/:p/overview` (compteurs par statut, items à moi, catégorie du type, dernière activité) ; test dans `project-overview.test.ts`.
- Web : onglet Trackers (cartes groupées par catégorie, barre empilée avec texte alternatif, lien vers la Recherche filtrée) et Vue d'ensemble (mes items, trackers, puis `DashboardPage embedded`). Onglet Trackers ajouté à `IMPLEMENTED_TABS`.
- Tests : `web9.test.tsx` (groupes, ordre, axe, vue d'ensemble).

## Reste à faire
- Les liens des cartes pointent vers la Recherche filtrée (`trackerHref`) jusqu'à T-0056 (écran Tracker `/t/:tracker/tableau`) : un seul endroit à changer.
- Jalons à venir et items bloqués : jalons déjà dans le tableau de bord (roadmap) ; « bloqués » et couverture arrivent avec le Lot 2.

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0055 (Planification, Code, Activité, Membres).
