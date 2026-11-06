# Journal de la tâche T-0067

## Fait
- API : `MatrixService` / `MatrixController` (`GET /v1/projects/:p/matrix`), tuiles de 500 lignes (`rowOffset`) sur 200 colonnes (`offset`), indicateur `linked` par ligne et `uncoveredRows` calculés sur tout le tracker, titres restreints masqués, aucune migration ; `matrix.test.ts` (6).
- Web : `MatrixView` en **défilement virtuel** (grille ARIA, seules les cellules visibles sont dans la page, tuiles chargées au défilement, dimensions posées par propriétés CSS car la CSP interdit `style`), sélecteurs de tracker en colonnes et de type de lien dans l'adresse (`mx`, `mt`), ligne « non couvert » signalée par texte et pointillé, lien suspect au nom accessible, création de lien depuis une case vide, export CSV complet côté client ; `web15.test.tsx` (6, dont 10 000 × 5 000 et axe), e2e `matrice.spec.ts`.

## Écarts
- Aucun. La pagination par 200 colonnes de la première version a été remplacée par le défilement virtuel (règle de changement de lot : pas d'écart toléré).

## Décisions
- Créer un lien depuis la matrice ne demande pas de confirmation (action réversible) ; si le type n'autorise que l'autre sens, le lien est créé dans ce sens.

## Prompt de reprise
Lire `docs/dev/STATE.md`.
