# T-0189 : composant `<Chart>` (B09)

- `packages/ui/src/chart.tsx` : barres ou courbes, rendu SVG, module ECharts chargé à la demande (`chart-echarts.ts`, import dynamique).
- `chart-option.ts` : option calculée sans ECharts (testable). Couleurs lues à l'exécution sur les jetons `--ath-data-1` à `8`, texte, bordure et surface flottante, donc valables pour les 11 thèmes et les deux modes ; relues quand `data-theme`, `data-mode` ou `data-density` changent.
- Accessibilité : `aria` ECharts, motifs (`decal`), bascule Graphique / Tableau, vue tableau avec un lien par catégorie (`hrefFor`, `renderLink`) ; le clic sur le graphique appelle `onSelect` ou ouvre `hrefFor`. Si le chargement d'ECharts échoue, le tableau s'affiche seul.
- CSP : infobulle `richText` imposée (voir T-0188). `deploy/docker/nginx.conf` compresse maintenant en gzip (décision de l'utilisateur sur le poids : 220 Ko gzip acceptés).
- `echarts-modules.d.ts` : types des sous-chemins d'ECharts (absents de son champ `exports`).
- Tests : `chart.test.tsx` (option, vue tableau). Non fait : aucun écran n'utilise encore `<Chart>` ; les premiers usages viennent avec les incréments suivants du PPM.
