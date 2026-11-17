# T-0205 : export CSV du tableau de santé (B22)

- `GET /v1/portfolios/:k/health?format=csv` (mêmes filtres que la vue) : `healthCsv` (BOM, 18 colonnes, cellules `= + - @` neutralisées, guillemets doublés), marquage `ExportMarker` (en-tête et pied). `ExportMarker` exporté par `CoreModule`.
- Lien « Exporter en CSV » dans le tableau (mêmes filtres). Tests : `ppm/health.test.ts` (mêmes lignes que la vue, marquage, aucune trace d un projet masqué, injection de formule).
