# T-0244 à T-0247 : priorisation, demandes, scénarios, valeur acquise, API (B41)

- Migration 082 : modèle de scoring versionné, critères, notes (visibilité via le ticket), conversion ou refus d'une demande, scénarios et changements. Type de tracker livré `request` (Demande).
- `ppm/scoring.service.ts` : score = somme des poids × valeurs normalisées ÷ somme des poids des critères renseignés (inversé pour « plus bas, mieux »), complétude, « incomplète » sous 70 %, nouvelle version à chaque changement de poids, anciennes notes lisibles.
- `ppm/request.service.ts` : conversion en projet depuis un gabarit (liée à la demande), refus avec motif obligatoire, décision unique.
- `ppm/scenario.service.ts` : scénarios « et si » calculés en mémoire par des fonctions de lecture injectées (propagation, charge d'équipe, budget) ; test d'architecture : aucun import d'un service d'écriture, écriture limitée à `scenario` et `scenario_change`.
- `ppm/earned-value.service.ts` : BAC, PV, EV, AC, CPI, SPI et quadrant par projet d'exécution.
- Routes `/v1/portfolios/:k/ranking|scoring-model|scores|scenarios|earned-value`, `/v1/requests/:t/convert|refuse` ; interrupteur `ppm.demand`. Tests : `scoring.test.ts`, `prioritization.test.ts`.
