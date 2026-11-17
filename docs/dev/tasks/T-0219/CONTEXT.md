# T-0219 : jobs instantanes et retention (B32)

- `ppm/snapshot-job.service.ts` : pour chaque portefeuille, l instantané de la période en cours (hebdomadaire ou mensuel selon le réglage PPM), puis purge selon la rétention du réglage. Rejouable. Identité système (admin). Boucle `instantanés` du worker (toutes les heures, `worker.ts`, `workers/tasks.ts`).
- Non fait : surcharge de la rétention par portefeuille (§ 2.5 : un portefeuille peut surcharger les deux valeurs) ; instantané automatique à la création d une revue (T-0221).
- Tests : `ppm/snapshot-job.test.ts`.
