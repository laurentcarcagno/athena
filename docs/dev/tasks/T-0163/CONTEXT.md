# Journal de la tâche T-0163

## Fait
- API : `PATCH /v1/projects/:p/schedule/tasks/:key` (administrateur, chef du projet), corps `{ start }` (déplace en gardant la durée), `{ due }` (étire) ou `{ duration }` (jours ouvrés) : exactement un champ. Dates calées sur un jour ouvré. Un jalon ne change que par sa date ; une tâche parente est refusée (dates calculées). La modification puis la replanification des successeurs partagent un lot : un seul commit « replanification ». Réponse : `{ moved, keys, batch }`.
- `GET /schedule` expose l'identifiant des liens et la version des tickets.
- Gantt (`ScheduleGantt`, prop `edit`) : durée modifiable dans le tableau (Entrée ou sortie du champ), glisser une barre ou sa poignée de fin (un jour = 24 px, aperçu pendant le glisser), poignée de lien (glisser vers la ligne du successeur), bouton « Lier à… » avec décalage et liste des liens à retirer. Clavier : flèches = début (date pour un jalon), Maj + flèches = fin, Entrée = « Lier à… ». Souris seulement (événements mouse) ; sur écran tactile, durée, clavier et « Lier à… » restent disponibles.
- `PlanningPage` : le chef de projet (rôles `athena-admin`, `athena-pm`) reçoit les contrôles ; annonce « n tickets déplacés » (toast et zone `role="status"`), rechargement après chaque action ; un refus (cycle, 422) passe par `useFailure`. Lier crée le lien puis lance la replanification. L'utilisateur voit le planning en lecture avec une mention.
- Tests : API 28 (édition : durée, début, fin, jalon, parente, validations, lot unique) + HTTP ; web `planning-edit.test.tsx` (14).

## Décisions et pièges
- Le calcul ne ramène jamais une tâche en arrière : réduire une durée laisse de la marge aux successeurs.
- Le décalage d'un lien se fixe à la création (« Lier à… » ou glisser = 0) ; pour le changer, retirer et recréer le lien.
- Aucun e2e (consigne du demandeur pour cette série).

## Prompt de reprise
T-0164 : chemin critique affiché et baselines de planning.
