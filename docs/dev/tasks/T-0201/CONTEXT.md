# T-0201 : API du tableau de santé (B18)

- `ppm/health.service.ts` : `GET /v1/portfolios/:k/health` (lecteurs : admin, PMO, chef de projet, directeur). Par projet visible : santé affichée (forcée sinon calculée), calculée, déclarée (pire niveau de la dernière météo), écart, cycle de vie, dates et sponsor (`project_meta`), phase et prochaine revue (`project_phase`), retards, bloqués, avancement, risque maximal (probabilité x impact des risques ouverts, champs lisibles par les rôles du lecteur).
- Filtres `state` (catégories), `phase`, `health`, `sponsor`, `includeClosed` ; clos, annulés et archivés exclus par défaut et comptés (`hiddenByState`). Tri : santé, risque maximal, retards, clé.
- Les projets masqués au lecteur (RLS) n ont ni ligne ni total : tests de visibilité en T-0202.
- Tests : `ppm/health.test.ts` (4).
