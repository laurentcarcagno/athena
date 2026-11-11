# Journal de la tâche T-0139

## Fait
- Thèmes : `data.1` à `data.8` (bleu, orange, sarcelle, violet, rose, citron vert, ciel, jaune : bordures des teintes, ≥ 3:1 sur la carte) et `surface.raised` (la carte en clair, un cran plus claire en sombre) dans chaque thème et chaque mode ; contrat : 78 paires (séries sur carte ; texte, lien et texte atténué sur surface flottante).
- Graphiques : barres de progression, Gantt, barre empilée (trois catégories, trois séries distinctes), burndown (série « reste à faire » et pastilles de légende) sur la palette de données ; la ligne « idéal » reste une référence en texte atténué pointillé.
- Couches flottantes sur `surface.raised` : modale, menu du fil d'Ariane, suggestions ATQL, centre de notifications, liste des mentions, sélecteur de section mobile.
- Page de connexion : `login.source.css` (règles sur jetons seulement, casse de phrase, rayon et élévation du thème) + jetons d'Hemeria clair et sombre générés par `pnpm --filter @athena/ui login-theme` (`scripts/build-login.mjs`) → `login.css` ; libellés espacés de leur champ.
- Vérifications : thèmes conformes (78 paires) ; `@athena/ui` 55/55 (`charts.test.ts`) ; web 445/445 ; aperçus de la connexion en clair et en sombre relus ; comparaison visuelle 96/96 sans reprise ; suite e2e complète (voir STATE).

## Reste à faire
- Rien. Suivante : T-0140 (thèmes de la vague 2).

## Décisions et pièges
- La page de connexion suit le thème par défaut de l'organisation (proposition validée, Q-17) : Keycloak sert une feuille statique, générée au déploiement avec ce thème (`login-theme -- --theme <nom>`, documenté dans `docs/admin/INSTALLATION.md`). La préférence personnelle, connue seulement après connexion, ne s'y applique pas.
