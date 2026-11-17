# B16 : performance du tableau de santé au palier 1

Date : 2026-11-17. Mesure : `apps/api/src/ppm/portfolio-perf.test.ts` (`ATHENA_PERF=1 pnpm vitest run src/ppm/portfolio-perf.test.ts`), base PostgreSQL de développement sur disque USB.

Jeu : 1 portefeuille, 50 projets, 60 tickets chacun (3 000 tickets), échéances étalées sur 20 jours. `PortfolioService.summary` avec le vrai `KpiService`, cache neuf à chaque appel (aucun projet réutilisé), 20 appels.

| Min | Médiane | P95 | Max |
|---|---|---|---|
| 1 165 ms | 1 295 ms | 1 596 ms | 1 623 ms |

**Verdict** : P95 sous 2 s, donc B32 (calcul précalculé) n'est pas avancé. La marge est faible (80 % du seuil) sur un disque lent ; le coût est linéaire en nombre de projets (≈ 26 ms par projet). Au-delà d'une centaine de projets par portefeuille, ou si B18 ajoute des calculs par projet (phases, risques), refaire la mesure avant de la livrer.
