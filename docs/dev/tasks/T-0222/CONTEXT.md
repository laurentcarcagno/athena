# T-0222 : courbe de tendance des jalons, MTA (B34)

- `GovernanceService.milestoneTrend` (`GET /v1/portfolios/:k/milestone-trend/:projet`) : pour chaque date prévue modifiée (`project_phase_history`), la date du relevé et la nouvelle date prévue. Graphique `<Chart>` (ligne par jalon, jours depuis la première date prévue, vue tableau fournie par le composant) dans `GovernancePanel`.
- Écart : la diagonale de référence de la maquette n est pas tracée (le composant ne supporte pas de marque de référence).
