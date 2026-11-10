# Lot 10 : thèmes et refonte visuelle (2026-11-10)

Décisions : `docs/dev/DECISIONS/ADR-0004-themes.md`. Audit d'origine : audit visuel et technique du 2026-11-10, résumé dans l'ADR § 1.
Règle : une tâche par session, dans l'ordre ci-dessous ; arrêt et compte rendu en fin de lot ; aucun écart toléré sans accord explicite.

Les tâches T-0127 à T-0131 sont de la **plomberie sans changement visible** : `e2e/tests/visuel.spec.ts` doit rendre des captures identiques à la référence prise en T-0126. Les numéros de migration sont indicatifs (prochaine migration réelle : 053).

## Tâches

| Tâche | Lot | Objet | Critères d'acceptation |
| --- | --- | --- | --- |
| T-0126 | A | ADR-0004 ; ce plan ; évolution de `DESIGN.md` (§ 1, journal) et de `CLAUDE.md` ; spécification de captures `visuel.spec.ts` et captures de référence | ADR et plan relus par l'utilisateur ; `validate-design --strict` et `lint-design` OK ; références prises (12 écrans × 2 modes × 4 largeurs) |
| T-0127 | B1 | `packages/theming` (`@nuance/theming`) : schéma DTCG, résolution des alias, des modes et de l'héritage, contrôle des contrastes, générateur CSS, CLI `build` et `check` | Tests unitaires : alias circulaire refusé, paire sous le seuil = échec, sortie CSS déterministe ; aucune dépendance à `@athena/*` (test d'import) |
| T-0128 | B2 | Runtime : `applyTheme` (attributs), préférence système, persistance injectable, `ThemeProvider` / `useTheme` ; remplace `apps/web/src/lib/theme.ts` | e2e `theme.spec.ts` inchangé et vert ; tests du runtime (système, choix mémorisé, événement de changement) |
| T-0129 | B3 | `packages/themes` (`@nuance/themes`) : thème Hemeria en DTCG (clair, sombre), contrat sémantique d'Athena | Les valeurs calculées de chaque variable sémantique sont égales à celles de `tokens.generated.css` (test) ; captures identiques |
| T-0130 | B4 | `styles.css` en couches sémantique et composant, partie 1 : couleurs ; suppression des réaffectations de primitives et des redéfinitions locales ; lint étendu (`rgba`, `#RGB`, `color-mix`) | 0 usage de `--ath-color-*` dans `styles.css` ; lint vert ; captures identiques ; axe-core vert dans les deux modes |
| T-0131 | B5 | Partie 2 : typographie, espacement, tailles, bordures, z-index (7 niveaux), mouvement en tokens ; `styles.css` découpé par composant ; retrait de `build-tokens.mjs` et du front matter comme source | 0 `font-size`, `z-index`, `transition` littéral (lint) ; captures identiques |
| T-0132 | C1 | Typographie : casse de phrase, échelle (22 / 16 / 14 / 12), titres de section et de carte unifiés, graisses 500 et Mono 600 chargées, prose ≤ 72 caractères, dates localisées | Aucun `text-transform: uppercase` ; un seul traitement par niveau de titre (test de classes) ; captures revues par l'utilisateur |
| T-0133 | C2 | Contrôles de formulaire : `Select`, `Textarea`, `Checkbox`, `Radio`, `Switch` ; hauteur unique (32 / 28 px) ; états survol, focus, erreur, désactivé, lecture seule (cadenas, info-bulle) ; migration des 66 `select` et des 44 `input` | Aucun `<select>` ni `<input type="checkbox">` nu dans `apps/web/src` ; e2e verts ; focus visible mesuré |
| T-0134 | C3 | `Tabs` unifié (état et liens) dans Fiche, Organisation, Tracker, Rapports, Paramètres ; pastille / tag / chip distincts ; `IconButton` unique ; sélection et survol communs ; tableau (en-tête clair, tri lisible) ; `PageHeader` avec projet ; carte | Routes inchangées (tests de navigation verts) ; flèche de tri ≥ 3:1, libellé de chip ≥ 4,5:1 |
| T-0135 | C4 | Densité Normal / Compact, `pointer: coarse` ; préférence sur le compte (migration) ; réglage dans Profil | Compact : contrôles 28 px, jamais < 12 px ni cible < 24 px (test) ; préférence appliquée sur un navigateur neuf |
| T-0136 | D1 | Thèmes vague 1 : Contraste élevé, Catppuccin, Nord, Gruvbox ; sélecteur à vignettes dans Profil ; thème par défaut et liste autorisée (Administration > Apparence, migration) ; palier 1024 px | `theming check` vert pour chaque thème × mode ; axe-core vert sur 6 écrans par thème × mode ; `NOTICE` des licences |
| T-0137 | D2 | Marque : `brand.mark` / `brand.logo` dans le manifeste ; surcharge par l'organisation ; téléversement sécurisé (PNG, WebP, SVG nettoyé, 64 Ko, S3, `CSP: sandbox`) ; favicon | Test : SVG avec `<script>` ou lien externe refusé ou nettoyé ; affichage par `<img>` uniquement ; e2e de remplacement d'icône |
| T-0138 | D3 | Teintes nommées des statuts : champ `color` (liste fermée) dans l'API, `tracker.yaml`, gabarits (migration) ; nuancier dans l'éditeur de workflow ; pastilles, board, graphiques | Défaut par catégorie (écrans inchangés sans choix) ; teinte inconnue refusée par l'API ; 12 teintes AA dans chaque thème × mode |
| T-0139 | D4 | Palette de données `--data-1..8` ; burndown, barres, Gantt, barre empilée, `ReleaseCharts` ; surface flottante `--surface-raised` ; thème de connexion Keycloak généré | Aucun graphique n'emploie l'action ni un signal comme couleur de série ; segments ≥ 3:1 ; `login.css` généré, sans hex en dur |
| T-0140 | D5 | Thèmes vague 2 : Solarized, Dracula / Alucard, Tokyo Night (Night, Day), Rosé Pine (Main, Dawn) | Mêmes critères que T-0136 |
| T-0141 | — | Vérification du lot critère par critère (`LOT10-VERIFICATION.md`) : captures thème × mode × 4 largeurs, axe-core par thème, e2e | Tous les critères tenus ou écart accepté explicitement |
