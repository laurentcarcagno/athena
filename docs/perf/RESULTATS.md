# Mesures de performance

Mesure du 2026-10-31, PostgreSQL 16 en conteneur local (poste de développement, 12 cœurs), recherche ATQL via `SearchService` (requête, comptage et page de 50 résultats), 10 exécutions par requête. Reproduire : `ATHENA_PERF=1 pnpm --filter @athena/api exec vitest run src/perf` (`ATHENA_PERF_ROWS` pour changer le volume).

```
jeu de données : 100000 artefacts en 4203 ms
statut + tri par date              p50    42 ms   p95    50 ms   (20000 résultats)
champ + nombre + tri numérique     p50   194 ms   p95   198 ms   (17948 résultats)
recherche textuelle (ILIKE)        p50   145 ms   p95   150 ms   (11 résultats)
tracker + date                     p50   133 ms   p95   137 ms   (100000 résultats)
champ vide                         p50   286 ms   p95   290 ms   (75000 résultats)
clé exacte                         p50     4 ms   p95     5 ms   (1 résultats)
liste complète, première page      p50   137 ms   p95   142 ms   (100000 résultats)
```

## Lecture
- Objectif du plan (§ 10) : liste de 10 000 artefacts en moins de 1 s, recherche p95 sous 500 ms. **Atteint à 100 000 artefacts** pour toutes les requêtes mesurées (p95 sous 300 ms).
- Les requêtes sans index dédié (recherche textuelle `~`, champs JSONB non indexés) parcourent la table : le coût croît linéairement. À 1 million d artefacts, compter de l ordre de 10 fois plus ; au-delà de ce volume, prévoir l index plein texte PostgreSQL (`tsvector`) annoncé au plan et des colonnes générées pour les champs fréquemment filtrés.
- Mesure faite sur une machine de développement avec les données en cache : à refaire sur l environnement cible avant la mise en production.
- Non mesuré : débit des webhooks, charge concurrente (500 utilisateurs), temps de reconstruction depuis Git. Le garde-fou de régression (5 000 artefacts, seuils larges) tourne dans la suite de tests.
