# Journal de la tâche T-0068

## Fait
- Migration **036** (la fiche disait 035, déjà prise) : table `coverage_rule` (RLS forcée, politique `org_isolation`, droits `athena_app`), index sur les liens entrants et par type, index partiels sur les liens suspects.
- API : `CoverageService` / `CoverageController` (créer, modifier, supprimer ; règles d'organisation et de projet ; calcul par règle en une requête), `coverage.test.ts` (6, dont 100 000 artefacts calculés en moins de 2 s). L'onglet Traçabilité s'active aussi quand il existe un type de lien d'organisation.
- ATQL : nouveau prédicat `linkCount("type", n[, "in"|"out"])`, de sorte que chaque règle a une requête exacte pour ses items en défaut (`NOT linkCount(...)`, ou `notLinked` pour « au moins 1, deux sens »).
- Web : `TraceabilityTab` (taux, niveau en texte, nombres tous cliquables, items en défaut, création, modification et suppression réservées aux administrateurs), route `tracabilite`, `web16.test.tsx` (7, dont axe), e2e `tracabilite.spec.ts`.
- Défaut de performance évité : le dénombrement des items à lien suspect en sous-requête corrélée était quadratique (plus de 100 s sur 100 000 artefacts) ; ensemble précalculé, index partiels et un seul balayage par règle.

## Décisions de l'utilisateur
- Écriture des règles de couverture réservée aux administrateurs (pas aux chefs de projet).
- La couverture StrictDoc (`doc-link.service.ts`) est conservée telle quelle ; l'onglet Documents relève du Lot 5.

## Écarts
- Aucun.

## Prompt de reprise
Lot 2 terminé : compte rendu à l'utilisateur, qui décide d'ouvrir le Lot 3.
