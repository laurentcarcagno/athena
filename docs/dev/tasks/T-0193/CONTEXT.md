# T-0193 : phases datées et décisions de gate, API (B12)

- Migration 069 : `project_phase` (dates prévues, revue prévue et tenue, décision, auteur, date, note) et `project_phase_history` (ajout seul, `planned_end` et `review_planned_on`). Lignes créées à la première écriture, pas depuis le gabarit à la création du projet ; sans ligne, tout est vide.
- `core/template-upgrade.service.ts` : `phaseCheck` porte `record` (phase courante) ; `status.phases` porte dates et décisions, avec `offTemplate` pour une phase retirée par le gabarit ; `status.phaseHistory`. `setPhaseDates` (phase du gabarit épinglé seulement, fin avant début refusée). `advancePhase(…, { decision, note, heldOn })` : `go` par défaut ; `go_with_reserves` et `no_go` exigent une note ; `no_go` enregistre sans avancer (`to` = `from`) et sans exiger les critères.
- Routes : `PUT /v1/projects/:p/template/phases/:phase` (chef du projet ou administrateur), `POST …/phase/advance` accepte un corps facultatif.
- Tests : `core/normative-templates.test.ts` (14), API 738/738.
- Non fait : droit de décision de l'assurance qualité « si le gabarit l'exige » (le circuit 041 n'est pas branché) ; `advance` garde ses rôles `athena-admin`/`athena-pm` sans exiger d'être chef du projet (comportement existant) ; frise et saisie dans l'interface = T-0194.

Écart 3 corrigé : `POST …/phase/advance` exige `requireManager` (chef du projet ou administrateur). Écarts 1 (lignes créées depuis le gabarit) et 2 (décision par l'assurance qualité) **reportés** à la demande de l'utilisateur (2026-11-17).
