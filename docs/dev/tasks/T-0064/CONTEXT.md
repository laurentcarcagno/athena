# Journal de la tâche T-0064

## Fait
- Migration **035** : `field_definition.is_content` et `link_type.propagates_suspect` (vrais par défaut : comportement d'avant conservé).
- `artifact.service.update` : ne marque suspects que les liens dont le type propage la suspicion, et seulement si un champ de contenu a changé (la restauration passe par `update`, donc même règle ; une transition ne marque rien).
- `isContent` dans `FieldSpec`, création de tracker/champ, `PATCH …/fields/:field`, définition, `tracker.yaml` (seulement quand décoché), reconstruction, templates (`TemplateTrackerSchema`, `trackersOf`) ; `propagatesSuspect` dans les types livrés (faux pour `blocks`) et l'administration des types de liens.
- Gabarits livrés : responsable, versions, priorité, échéance et points marqués hors contenu.
- Web : case « Champ de contenu » (éditeur de tracker, page de configuration avec bascule d'un clic), colonne « Contenu », case « Propage la suspicion » et étiquette « Sans suspicion » dans Organisation > Liens.
- Tests : `suspicion.test.ts` (7), `reverse-rebuild.test.ts` (aller-retour du drapeau), `web2.test.tsx`, `web13.test.tsx`.

## Reste à faire
- La suspicion reste portée par la cible du lien (comportement conservé) ; les fonctions ATQL `suspect()` etc. : T-0065.

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0065 (ATQL).
