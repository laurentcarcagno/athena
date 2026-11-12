# T-0161 : moteur de dates

- **Objectif** : passe avant / arrière, marge, chemin critique ; `GET /v1/projects/:p/schedule` ; `POST .../schedule/apply` en un commit GitLab « replanification » ; parents calculés depuis les enfants (D3) ; événement `schedule.changed`.
- **Critères d'acceptation** (testables) : planning de référence exact au jour près ; marge et critique ; un seul commit pour N tickets ; 500 tickets + 800 liens en moins de 200 ms.
- **Fichiers concernés** : `apps/api/src/planning/*`, `core/artifact.service.ts` (`updateMany`), `history/history-sync.ts` (lots), `core/work-calendar.ts` (jours entiers).
- **Hors périmètre** : interface (T-0162), chemin critique affiché (T-0164), baselines de planning (T-0164).
- **Dépendances** : T-0159, T-0160.
