# T-0139 : palette de données, surface flottante, page de connexion

- **Objectif** : graphiques sur une palette de données propre à chaque thème ; menus et panneaux sur une surface flottante ; thème de connexion Keycloak généré par le moteur.
- **Critères d'acceptation** : aucun graphique n'emploie l'action ni un signal comme couleur de série ; séries ≥ 3:1 sur la carte (contrat) ; `login.css` généré, règles sans couleur écrite en dur (lint) ; tests et e2e verts.
- **Fichiers** : `packages/themes` (`tools/derive.mjs`, `tools/hues.mjs`, `data.*` et `surface.raised` dans chaque thème, contrat) ; `packages/ui` (`styles/*` : graphiques et couches flottantes, `scripts/build-login.mjs`, `package.json`, `charts.test.ts`) ; `deploy/dev/keycloak/themes/athena/login/resources/css/login.source.css` et `login.css` ; `e2e/tests/apercu-themes.spec.ts`.
