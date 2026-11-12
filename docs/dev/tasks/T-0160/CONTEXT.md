# Journal de la tâche T-0160

## Fait
- Migration 059 : `organization_calendar` (jours ISO travaillés) et `calendar_holiday`, avec RLS. Sans ligne : lundi au vendredi, aucun férié.
- `core/work-calendar.ts` (pur, sans base) : `isWorkingDay`, `alignToWorkingDay`, `addWorkingDays` (négatif accepté), `workingDaysBetween` (intervalle ]a, b], cohérent avec l'ajout), `listWorkingDays`. Dates en `AAAA-MM-JJ`, sans fuseau.
- `CalendarService` (`get`, `load` pour les calculs, `put` qui remplace l'ensemble, audité `calendar.update`) ; `GET /v1/calendar` (tous les rôles), `PUT /v1/admin/calendar` (administrateur).
- Web : onglet Administration > Calendrier (`components/Calendar.tsx`), textes FR et EN.
- Tests : `work-calendar.test.ts` (6), `calendar.test.ts` (5), droits dans `core-http.test.ts`, `calendar.test.tsx` (3). API 640 et web 481 verts ; lint design OK.

## Reste à faire
- Rien pour T-0160. Suite : T-0161 (moteur de dates) : charger le calendrier avec `CalendarService.load`.

## Décisions et pièges
- La bibliothèque vit dans l'API (pas de nouveau paquet) : le Gantt (T-0162) recevra du serveur les jours non ouvrés à griser.
- Un enregistrement remplace semaine et fériés en bloc ; au plus 500 fériés.
- `addWorkingDays(c, d, 0)` rend `d` même s'il n'est pas ouvré ; utiliser `alignToWorkingDay` avant pour caler une date.

## Prompt de reprise
Lire `docs/dev/STATE.md`, `docs/dev/tasks/LOT12-PLAN.md` et ADR-0006 § 2.4, puis commencer T-0161.
