# Journal de la tâche T-0068

## Fait
- Migration **036** (la fiche disait 035, déjà prise) : table `coverage_rule` (RLS forcée, politique `org_isolation`, droits `athena_app`), index sur les liens entrants et par type, index partiels sur les liens suspects.
- API : `CoverageService` / `CoverageController` (règles d'organisation et de projet, calcul par règle en deux requêtes), `coverage.test.ts` (6, dont 100 000 artefacts calculés en moins de 2 s). L'onglet Traçabilité s'active aussi quand il existe un type de lien d'organisation.
- Web : `TraceabilityTab` (taux, niveau en texte, nombres cliquables, items en défaut, formulaire et suppression réservés aux administrateurs), route `tracabilite`, `web16.test.tsx` (6, dont axe), e2e `tracabilite.spec.ts`.
- Défaut de performance évité : le dénombrement des items à lien suspect en sous-requête corrélée était quadratique (plus de 100 s sur 100 000 artefacts) ; il passe par un ensemble précalculé et des index partiels.

## Écarts à signaler
- La requête ATQL des « items en défaut » n'existe que pour un nombre minimal de 1 et un sens « les deux » (`notLinked`) : sinon le nombre s'affiche sans lien, et la liste des 100 premiers items en défaut reste sur l'onglet.
- Seuls les administrateurs écrivent les règles (pas les chefs de projet) : le rôle de projet n'est pas encore exploité par l'API.
- La modification d'une règle se fait par suppression puis recréation (pas de PUT).
- La couverture StrictDoc (`doc-link.service.ts`) est conservée telle quelle ; l'onglet Documents reste à venir.

## Prompt de reprise
Lot 2 terminé : compte rendu à l'utilisateur, qui décide d'ouvrir le Lot 3.
