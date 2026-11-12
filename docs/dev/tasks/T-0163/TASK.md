# T-0163 : édition du planning

- **Objectif** : le chef de projet modifie le planning dans le Gantt : durée dans le tableau, glisser une barre (début), étirer (fin), lier par glisser depuis la poignée, équivalents clavier (flèches, « Lier à… ») ; replanification annoncée ; utilisateur en lecture.
- **Critères d'acceptation** (testables) : tests web souris et clavier ; changer une durée décale les successeurs ; utilisateur sans poignée ni champ ; cycle refusé avec message.
- **Fichiers concernés** : `planning/schedule.service.ts` (`edit`), `planning.controller.ts`, `components/ScheduleGantt.tsx`, `pages/PlanningPage.tsx`.
- **Dépendances** : T-0162.
