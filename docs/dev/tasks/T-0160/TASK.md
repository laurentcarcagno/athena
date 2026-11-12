# T-0160 : calendrier d'organisation

- **Objectif** : semaine ouvrée et jours fériés de l'organisation, API d'administration, Administration > Calendrier, bibliothèque de jours ouvrés (ajout, écart, liste).
- **Critères d'acceptation** (testables) : tests unitaires des jours ouvrés (week-end, férié, bornes) ; test API (droits admin, lecture par les membres) ; test web du formulaire.
- **Fichiers concernés** : migration 059, `core/work-calendar.ts`, `core/calendar.service.ts`, `core/calendar.controller.ts`, `components/Calendar.tsx`.
- **Hors périmètre** : moteur de dates (T-0161), absences (lot 14).
- **Dépendances** : T-0159.
