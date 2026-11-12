# Journal de la tâche T-0159

## Fait
- Migration 058 : rôles `start_date`, `progress`, `remaining` ; `link_type.ordered` ; `artifact_link.lag_days` (−365 à 365, jours ouvrés).
- `core/semantic-roles.ts` : liste unique des rôles (remplace six copies de l'énumération) et type de champ exigé (date / nombre / nombre), vérifié à la création du tracker et à l'ajout d'un champ (422).
- Type de lien livré « précède » / « succède à » (`ordered`), sans paire ; cycle → 422 (`validation`), décalage refusé sur un type non ordonné ; le caractère ordonné d'un type utilisé ne change plus. `POST .../links` accepte `lagDays` ; `LinkView` expose `ordered` et `lagDays`.
- Gabarits Spatial (1.0 et 1.1) et Défense : ni l'un ni l'autre n'avait de tracker Tâche, ajout d'un tracker `TSK` « Tâches » (`taskTracker()` dans `templates/common.ts`, marquage sur Défense) avec début, échéance, avancement, reste à faire.
- `tools/dev-start.mjs` : NOVA avec dates, avancement, reste à faire et 8 liens « précède » (un avec décalage). Amorçage seulement sur une base sans NOVA.
- Web : les trois rôles dans le sélecteur de `TrackerBuilder`.
- Tests : `core/planning-model.test.ts` (10), rebuild GitLab avec les rôles (`reverse-rebuild.test.ts`), listes de types et de trackers ajustées. API : 627 tests verts.

## Reste à faire
- Rien pour T-0159. Suite : T-0160 (calendrier d'organisation et jours ouvrés).

## Décisions et pièges
- Cycle d'un lien ordonné : 422 (comme les autres refus de saisie), alors que le cycle hiérarchique reste 409.
- Les gabarits ne contenaient pas de tracker Tâche : il a été ajouté (écart avec la formulation du plan, sans autre effet : montée de version 1.0 → 1.1 inchangée pour les autres trackers).
- La démonstration NOVA n'est pas rejouée sur une base qui la contient déjà : supprimer le projet NOVA pour la réamorcer.
- Les liens ne sont pas écrits dans GitLab : pas de format de fichier à faire évoluer.

## Prompt de reprise
Lire `docs/dev/STATE.md`, `docs/dev/tasks/LOT12-PLAN.md` et ADR-0006 § 2.4, puis commencer T-0160.
