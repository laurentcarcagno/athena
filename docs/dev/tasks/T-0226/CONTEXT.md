# T-0226 : saisie de la capacité (B35)

- Migration 077 : `person_availability` (ratio, journée propre), `absence` (jour entier ou demi-journée, nature), `allocation` (nominative ou générique par équipe et rôle ; politique acl_read).
- `ppm/capacity-data.service.ts` : droits (personne : ses absences ; manager : membres de ses équipes ; admin : tout ; PMO et direction lisent sans le motif des absences ; chef de projet : allocations de son projet). Routes `/v1/capacity/availability|absences`, `/v1/projects/:p/allocations`, interrupteur `ppm.capacity`.
- Tests : `capacity-data.test.ts`.
