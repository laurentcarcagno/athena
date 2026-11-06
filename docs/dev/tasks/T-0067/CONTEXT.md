# Journal de la tâche T-0067

## Fait
- API : `MatrixService` / `MatrixController` (`GET /v1/projects/:p/matrix`), lignes limitées à 500, colonnes paginées par 200, indicateur `linked` calculé sur toutes les colonnes, titres restreints masqués, aucune migration ; `matrix.test.ts` (5).
- Web : `MatrixView` (sélecteurs de tracker en colonnes et de type de lien dans l'adresse `mx`, `mt`, `mo`), ligne « non couvert » signalée par texte et pointillé, lien suspect au nom accessible, création de lien depuis une case vide, export CSV côté client ; vue `matrice` dans `TRACKER_VIEWS` ; `web15.test.tsx` (5, dont axe), e2e `matrice.spec.ts`.

## Écart à signaler
- Les colonnes sont paginées par fenêtres de 200, non virtualisées : l'affichage reste borné, mais le défilement horizontal ne charge pas en continu.

## Décisions
- Créer un lien depuis la matrice ne demande pas de confirmation (action réversible, pas de style danger) ; si le type n'autorise que l'autre sens, le lien est créé dans ce sens.

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0068 (règles de couverture et onglet Traçabilité, migration suivante).
