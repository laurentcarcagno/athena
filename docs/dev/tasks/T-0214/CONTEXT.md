# T-0214 : API de la roadmap consolidée (B27)

- `GET /v1/portfolios/:k/roadmap` (`ppm/roadmap.service.ts`) : par projet visible : dates, état du cycle de vie, fin calculée (fin la plus tardive des tâches planifiées), baseline la plus récente (nom, fin, écart en jours ouvrés = variance du Gantt pour la tâche qui finit le plus tard), phases (dates, revue prévue et tenue, décision, « non daté », « tenue en retard », phase courante), versions. Projets sans aucune date en fin de liste ; clos, annulés et archivés exclus et comptés (`includeClosed`). `CoreModule` exporte `ScheduleService` et `TemplateUpgradeService`.
- Les tâches ne remontent jamais. Tests : `ppm/roadmap.test.ts` (concordance avec le Gantt, projet masqué). Mesure de charge à faire à la vérification du lot.
