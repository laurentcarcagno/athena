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
- Non mesuré : débit des webhooks, charge à 500 utilisateurs réels sur l'environnement cible, temps de reconstruction depuis Git. Le garde-fou de régression (5 000 artefacts, seuils larges) tourne dans la suite de tests.

## Charge concurrente (2026-10-31)

Outil : `node tools/load-test.mjs --seed 50000 --seconds 10 --levels 10,50,200` (API réelle, un seul processus Node, PostgreSQL en conteneur, jeton Keycloak réel, 50 000 artefacts, limites de débit relevées). Poste de développement : à refaire sur la cible.

```
scénario              connexions   req/s    p50      p95
fiche artefact            10        913     11 ms    16 ms
fiche artefact            50       1267     39 ms    46 ms
fiche artefact           200       1202    168 ms   184 ms
liste (50 premiers)       10        127     77 ms    93 ms     (après plafonnement du comptage)
liste (50 premiers)       50        114    455 ms   485 ms
recherche ATQL            10         72    138 ms   148 ms     (champ JSONB + statut + tri, sans index dédié)
recherche ATQL            50         76    699 ms   737 ms
```

Constats et correctifs :
- Le comptage exact de la liste complète saturait le serveur (21 req/s). Le total est désormais plafonné à 10 000 (`totalCapped`, affiché « 10000+ ») : 6 fois plus de débit.
- Le débit est borné par PostgreSQL (parcours de table pour les filtres sur champs JSONB) : au-delà de ~75 recherches filtrées par seconde sur 50 000 artefacts, la latence croît linéairement avec la concurrence. Pistes : réplicas de lecture, colonnes générées indexées pour les champs fréquemment filtrés, plusieurs instances de l'API.
- Les lectures par clé tiennent 1 200 req/s à 200 connexions sans erreur.
