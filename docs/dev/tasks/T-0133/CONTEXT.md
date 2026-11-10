# Journal de la tâche T-0133

## Fait
- `@athena/ui` : `Select`, `Textarea`, `Checkbox`, `Radio`, `Switch` (élément natif, classe de la charte, `invalid`), `LockIcon` ; `Field` en lecture seule (classe `ath-field--readonly`, cadenas dans le libellé, raison en info-bulle et en description accessible).
- Styles : champ texte, liste, recherche et bouton à `size.control-md` (32 px) ; un seul anneau de focus (`focus.ring`, 2 px) pour champs, listes, cases, radios, interrupteurs ; états désactivé, erreur (`aria-invalid`), lecture seule (sans cadre) ; cases et radios de 16 px (`size.toggle`, jeton ajouté) avec marge de 4 px (cible 24 px) ; interrupteur sans transformation.
- Migration : 66 listes, 8 zones de texte, 21 cases à cocher dans 33 fichiers (analyse JSX tenant compte des accolades).
- Fiche : un champ dont `writeRoles` exclut l'utilisateur (même règle que `canUse` côté serveur, administrateur compris) est rendu en lecture seule avec « Lecture seule : modifiable par … ». Avant, il paraissait modifiable et le serveur refusait l'enregistrement.
- Dates : `DateTime` rend chaque date dans un `<time dateTime>` ; les captures masquent ces éléments (la date de création des données de test variait d'une exécution à l'autre).
- Vérifications : `@athena/ui` 44/44, lint ; web 430/430 ; e2e `controles.spec.ts` (hauteurs 32 px, focus 2 px au clavier) et `theme.spec.ts` (axe, deux modes) verts ; suite e2e complète (voir STATE) ; référence visuelle reprise, stable sur deux passes.

## Reste à faire
- Rien. Suivante : T-0134.

## Décisions et pièges
- Les champs texte restent des `<input className="ath-input">` (aucun composant n'apporterait de comportement) ; le critère vise les listes et les cases.
- Un remplacement par expression régulière de balises JSX casse sur `=>` : utiliser un analyseur qui compte les accolades.

## Prompt de reprise
Lot 10, ADR-0004. T-0126 à T-0133 faites. Reprendre par T-0134 (onglets unifiés, pastille / tag / chip, IconButton, sélection et survol, tableau à en-tête clair, PageHeader avec le projet, Card ; pied du rail rogné).
