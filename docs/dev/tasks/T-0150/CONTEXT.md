# Journal de la tâche T-0150

## Fait
- Board : le dernier board ouvert d'un projet (board d'équipe ou board d'un tracker) est mémorisé dans le navigateur ; « Board » du rail y mène directement. L'index (`/board?tous=1`, lien « Tous les boards » dans l'en-tête d'un board) présente des cartes : nom, clé, nature (« Board d'équipe, colonnes configurées » ou « Une colonne par statut du tracker »), nombre de tickets pour les trackers, « Ouvrir le board ».
- Backlog : dates des sprints en clair (« du 20 nov. au 3 déc. 2026 · commence dans 9 jours ») ; burndown d'un sprint pas encore commencé : « Le burndown s'affichera dès le premier jour du sprint (20 nov.). » ; « Sprints à venir » vide : « Aucun sprint à venir » (« planifiez le suivant ci-dessous » pour qui peut planifier, au-dessus du formulaire existant).
- Roadmap : `Timeline` (SVG, positions en pourcentage, aucun style en ligne) : axe des mois, une barre par version avec nom, dates et « n / m tickets terminés », avancement, repère « aujourd'hui » ; dates des cartes de version en clair.
- `lib/dates.tsx` : `formatDay`, `formatSpan`, `relativeSpan`.
- Tests : web 466/466 (`dates-timeline.test.tsx`, board) ; e2e `board`, `backlog`, `roadmap`, `navigation` verts.

## Décisions et pièges
- La mémoire du dernier board est locale au navigateur (préférence de confort, pas une donnée du compte).
- La carte Roadmap de l'Avancement garde le Gantt compact jusqu'à T-0155, qui remplace cette carte par « Prochaine version ».
