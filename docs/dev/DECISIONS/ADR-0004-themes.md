# ADR-0004 : système de thèmes et refonte visuelle (Lot 10)

Statut : accepté (2026-11-10). Fait évoluer `packages/ui/design/DESIGN.md` (Hemeria 3.0.0) : Hemeria devient un thème parmi d'autres. Plan d'exécution : `docs/dev/tasks/LOT10-PLAN.md`.

## 1. Contexte

L'audit visuel et technique du 2026-11-10 relève que l'interface est disciplinée (une seule feuille de styles, aucun style en ligne, lint de palette) mais qu'elle ne peut pas porter plusieurs thèmes :

1. le CSS consomme les couleurs par leur nom primitif (172 usages contre 56 sémantiques) et le thème sombre réaffecte ces primitives (`darkPrimitiveMap`), puis des composants les redéfinissent localement : un nom de couleur ne garantit plus la couleur ;
2. `build-tokens.mjs` n'émet que couleurs, espacement, rayons et typographie : tailles, z-index (16 valeurs), bordures, durées, densités et tokens de composant sont écrits en dur ;
3. des superpositions (`rgba`, `color-mix`) supposent une surface inverse sombre ; le lint ne les voit pas ;
4. les titres de section ont cinq traitements, les contrôles de formulaire quatre hauteurs, la sous-navigation trois patterns ; trois contrastes sont sous le seuil (libellé de chip 4,01:1, flèche de tri 2,75:1, segment « en cours » 2,93:1) ;
5. la graisse 500 de Plex Sans n'est pas chargée.

## 2. Décisions (réponses du demandeur, 2026-11-10)

1. **La charte évolue.** Hemeria reste l'identité de couleurs d'**un** thème. Angles droits, absence d'ombre, liseré tricolore et rouge de cérémonie deviennent des choix du thème Hemeria, non plus des règles du système.
2. **Catalogue de thèmes** repris de palettes communautaires (licences MIT, mention dans `NOTICE`), **adaptées** pour tenir WCAG 2.2 AA (teintes conservées, luminosité des rôles de texte, d'action et d'état ajustée) :
   - vague 1 : Hemeria, Contraste élevé (vise AAA), Catppuccin (Latte, Mocha), Nord, Gruvbox ;
   - vague 2 : Solarized, Dracula (avec Alucard), Tokyo Night (Night, Day), Rosé Pine (Main, Dawn).
   Chaque thème a un mode clair et un mode sombre.
3. **Forme par thème** : les thèmes communautaires peuvent avoir un rayon de 2 à 8 px et une ombre douce **réservée aux couches flottantes** (menus, modales, toasts). Hemeria et Contraste élevé restent à angles droits et sans ombre.
4. **Plus de capitales espacées** : casse de phrase partout (boutons, onglets, chips, pastilles, en-têtes de tableau, rail, titres de modale).
5. **Densité** : deux niveaux, Normal (défaut) et Compact, réglage de l'utilisateur enregistré sur le compte. Sur écran tactile (`pointer: coarse`), cibles de 44 px automatiquement. Pas de niveau « confortable ».
6. **Couleurs des statuts** : l'administrateur choisit pour chaque statut une **teinte nommée** parmi 12 (`gray`, `slate`, `blue`, `sky`, `teal`, `green`, `lime`, `yellow`, `orange`, `red`, `pink`, `purple`) ; chaque thème fournit le triplet fond / texte / bordure de chaque teinte, vérifié AA. Jamais de code hexadécimal saisi. Défaut : teinte de la catégorie du statut.
7. **Icône de marque par thème** (`brand.mark`, `brand.logo`, variante par mode), remplaçable par l'administrateur. Téléversement : PNG, WebP ou SVG nettoyé côté serveur, 64 Ko au plus, stocké dans S3, servi avec `Content-Type` strict et `Content-Security-Policy: sandbox`, toujours affiché par `<img>`. La favicon suit le thème actif.
8. **Gouvernance** : l'organisation fixe le thème par défaut et la liste des thèmes autorisés ; l'utilisateur choisit dans cette liste (Profil). Le bouton clair / sombre / système du rail garde son rôle (mode).
9. **Moteur découplé** : deux paquets génériques, sans dépendance à Athena, dans ce dépôt :
   - `@nuance/theming` : schéma (W3C Design Tokens, DTCG), résolution des alias et des modes, contrôle des contrastes (échec du build sous le seuil), générateurs CSS / TS / JSON, CLI, runtime (`applyTheme`, préférence système, persistance injectable) et liaisons React optionnelles ;
   - `@nuance/themes` : thèmes en données (JSON DTCG, icônes SVG), aucun code.
   `@athena/ui` ne lit que des tokens sémantiques et de composant.
10. **Choix par défaut validés** : corps 14 px (Normal) et 13 px (Compact), jamais sous 12 px ; espacement 2, 4, 8, 12, 16, 20, 24, 32, 48 ; lecture seule = texte sans cadre, cadenas et info-bulle explicative ; nom et clé du projet dans l'eyebrow du `PageHeader` des sections de projet ; bandeau de protection fixe (texte, position, présence), couleurs du thème avec contraste ≥ 7:1 ; palette de données propre à chaque thème ; palier tablette à 1024 px ; mobile inchangé ; page de connexion Keycloak générée par le même moteur.
11. **Lot 10 ouvert.** L'écart 4 du lot 9 (manuel Word et captures) est accepté comme reporté à la fin du projet.

## 3. Architecture

### 3.1 Couches

| Couche | Préfixe | Qui la définit | Qui la lit |
| --- | --- | --- | --- |
| Primitives du thème | `--palette-*` | chaque thème | le thème seulement |
| Sémantique (contrat) | `--surface-*`, `--text-*`, `--border-*`, `--action-*`, `--state-*`, `--hue-<nom>-*`, `--data-1..8`, `--focus-*`, `--brand-*`, `--font-*`, `--text-size-*`, `--space-*`, `--radius-*`, `--elevation-*`, `--control-h-*`, `--z-*`, `--motion-*` | défauts du contrat, surchargés par thème, mode et densité | composants |
| Composants | `--button-*`, `--field-*`, `--table-*`, … | `@athena/ui` à partir de la sémantique ; un thème peut surcharger | composants |

Règle : **un composant ne lit jamais une primitive.** Les surfaces inverses ont leurs propres tokens (`--surface-inverse`, `--text-on-inverse`, `--hover-on-inverse`) : plus aucune redéfinition locale de variable.

### 3.2 Axes

`<html data-theme="<famille>" data-mode="light|dark" data-density="normal|compact">`. Sans `data-mode`, le mode suit `prefers-color-scheme`. Chaque thème est un fichier CSS généré, chargé à la demande ; changer de thème ne modifie que des attributs (compatible avec la CSP sans `unsafe-inline`).

### 3.3 Ce qu'un thème peut et ne peut pas changer

| Peut | Ne peut pas |
| --- | --- |
| Couleurs (via la sémantique), rayon 0 à 8 px, ombre des couches flottantes, police d'interface parmi les polices embarquées, icône et nom, palette de données, teintes nommées | Structure, navigation, libellés ; seuils de contraste ; cibles minimales (24 px, 44 px en tactile) ; police mono des identifiants (Plex Mono) ; texte, position et présence du bandeau de protection ; sens des états |

### 3.4 Outillage

- Le lint de `@athena/ui` refuse `rgba()`, `#RGB`, `#RRGGBB`, `color-mix()`, `font-size`, `z-index` et `transition` littéraux.
- Le moteur vérifie chaque paire obligatoire du contrat dans chaque thème × mode.
- Non-régression visuelle : `e2e/tests/visuel.spec.ts` (captures de référence, 12 écrans × clair et sombre × 375, 768, 1024, 1440 px). Les tâches T-0127 à T-0131 doivent rendre des captures identiques à la référence.

## 4. Ce qui ne change pas

Routes, entrées et ordre du rail, barre basse mobile, fil d'Ariane, raccourcis, workflows, permissions, libellés. Deux ajouts dans des pages existantes : Profil (thème, mode, densité) et Administration > Apparence (thème par défaut, thèmes autorisés, icônes).

## 5. Conséquences

- `CLAUDE.md` (section Conception) et `DESIGN.md` (§ 1 et § 9) sont mis à jour par T-0126.
- `DESIGN.md` et `DESIGN.json` restent la documentation de la charte ; à partir de T-0129, la source des valeurs est `@nuance/themes`. `build-tokens.mjs` et le front matter YAML sont retirés en T-0131.
- Migrations : préférence de densité et de thème (extension de 052, nouvelle migration), teinte des statuts, réglages d'apparence de l'organisation.
- Le manuel utilisateur (Word, captures) reste à refaire en fin de projet.
