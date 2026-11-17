# T-0188 : vérifications ECharts (B07, B08)

Dépendance ajoutée à `@athena/ui` : `echarts@5.6.0` (Apache 2.0, publiée le 2024-12-28).

Deux contrôles rejouables depuis `packages/ui` : `pnpm echarts:csp` et `pnpm echarts:poids` (sources dans `scripts/echarts-*.mjs`).

## B07 : rendu SVG sous la CSP de production (H-V1) : confirmée, avec une condition

CSP testée : celle de `deploy/docker/headers.inc` (`style-src 'self'`, sans `unsafe-inline`), page servie par un serveur local, Chromium.

- Rendu `svg` (pas de `canvas`), barres, courbe, légende, ligne de repère, `aria` et motifs (`decal`) actifs : 55 éléments tracés, libellé `aria-label` généré.
- **Condition : l'infobulle doit être en `renderMode: 'richText'`.** Avec l'infobulle HTML par défaut, ECharts écrit des attributs `style` par `innerHTML` : 20 violations `style-src-attr` et un rendu dégradé. En `richText`, l'infobulle est dessinée dans le SVG : **0 violation**. Les `style` posés par l'API CSSOM (conteneur, `<svg>`, `<text>`) ne sont pas bloqués par la CSP.
- À reprendre dans `<Chart>` (T-0189) : `tooltip.renderMode = 'richText'` imposé, et `tooltip.formatter` en texte brut (pas de HTML).

## B08 : poids (H-V2) : critère littéral non tenu, à décider

Import à la carte (`echarts/core`, `SVGRenderer`, barres, courbes, carte de chaleur, grille, infobulle, `aria`, légende, ligne de repère, jeu de données), minifié par Vite :

| | brut | gzip | brotli |
|---|---|---|---|
| ensemble prévu | 799 Ko | **220,6 Ko** | 178,8 Ko |
| minimum (SVG + barres + grille) | 655 Ko | 181,4 Ko | 148,6 Ko |

- Le socle `echarts/core` + `SVGRenderer` pèse à lui seul 181 Ko en gzip : retirer des graphiques ne ramène pas l'ensemble sous 200 Ko (au mieux 214 Ko). **Le critère « moins de 200 Ko compressés » n'est tenu qu'en brotli (179 Ko).**
- Le repli canvas annoncé par le plan n'allège pas : il est plus lourd. Il n'est donc pas retenu.
- Le chunk est chargé à la demande (import dynamique dans `<Chart>`), hors du paquet initial : il ne pèse que sur les pages qui montrent un graphique.
- `deploy/docker/nginx.conf` ne compresse rien aujourd'hui : activer `gzip` (et idéalement brotli) pour les `/assets/` est un préalable pour que les chiffres ci-dessus soient ceux vus par l'utilisateur.

Décision proposée à l'utilisateur : accepter 220 Ko en gzip / 179 Ko en brotli (chargement à la demande), ou renoncer à ECharts pour les seuls graphiques que les composants maison ne couvrent pas.
