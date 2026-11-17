# T-0227 : API de capacité (B35)

- `ppm/capacity.service.ts`, `GET /v1/capacity?from&to&granularity&team` : par personne et période : capacité, charge (allocations nominatives), palier, projets ; par équipe : capacité, charge nominative, besoin générique par rôle, libre ; goulots classés par saturation avec les projets qui chargent. Horizon borné à 60 périodes. Un manager ne voit que ses équipes (refus sinon), une personne que la sienne, PMO et direction tous.
- Calcul à la lecture (pas de job `capacite` : reporté, voir LOT21-PLAN). Tests : `capacity-view.test.ts` (calcul de référence, visibilité, semaines et mois, goulots).
