# Journal de la tâche T-0161

## Fait
- `planning/schedule-engine.ts` : fonction pure `computeSchedule(tâches, liens, calendrier)`. Passe avant (début = max de la date saisie et des fins de prédécesseurs + décalage), passe arrière depuis la fin du projet, marge totale en jours ouvrés, chemin critique (marge nulle), parentes calculées depuis les enfants (début le plus tôt, fin la plus tard, marge minimale). Cycles de dépendances ou de hiérarchie → 422 qui nomme les tâches.
- `planning/schedule.service.ts` : `get` (lit les trackers qui portent `start_date` et `due_date`, liens ordonnés et hiérarchiques, calendrier d'organisation ; titre masqué si lecture restreinte) et `apply` (écrit les dates qui bougent, un événement `schedule.changed`, audit `schedule.apply`).
- `GET /v1/projects/:p/schedule` (membres), `POST /v1/projects/:p/schedule/apply` (administrateur, chef de projet).
- `ArtifactService.updateMany` : plusieurs tickets en une transaction, révisions marquées `payload.batch`.
- `HistorySync` : les événements d'un même `batch` s'écrivent en un seul commit « replanification: N tickets » (trailers `Athena-Batch-Id`, `Athena-Actor`, `Athena-Keys`), même au-delà d'une page de 50 événements.
- `work-calendar.ts` passe en jours entiers (aucune date créée dans les boucles).
- Tests : moteur (15, dont 500 tâches + 800 liens), intégration (6), GitLab réel (1 commit pour 2 tickets), droits HTTP. API : 663 verts.

## Règles de calcul (à connaître pour T-0162 et suivantes)
- Durée = jours ouvrés de [début, fin], au moins 1. Sans début mais avec une fin : jalon (durée nulle, date = fin). Sans date : non planifiée, liens ignorés.
- Le calcul ne fait que repousser : jamais avant la date saisie. Réduire un prédécesseur ne ramène pas ses successeurs (la marge apparaît).
- Lien « précède » avec décalage L : début du successeur ≥ jour ouvré d'indice 1+L après la fin du prédécesseur (L = 0 : lendemain ouvré ; L = −1 : le jour même). Vers un jalon : indice L.
- Un lien posé sur une parente borne toutes ses descendantes ; depuis une parente, il part de sa fin. Lien parente ↔ sa descendante = cycle.
- Un seul parent par ticket (le premier lien hiérarchique créé).

## Reste à faire
- Rien pour T-0161. Suite : T-0162 (Planning remplace Roadmap, Gantt en lecture).

## Prompt de reprise
Lire `docs/dev/STATE.md`, `docs/dev/tasks/LOT12-PLAN.md` et ADR-0006 § 2.2, puis commencer T-0162.
