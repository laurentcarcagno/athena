---
name: Hemeria Design System
version: "3.0.0"
description: Sharp, sovereign mission-console UI for an internal engineering reference tool. Hemeria Charte Graphique 2025.
colors:
  sovereign-deep-blue: "#12293A"
  tricolor-blue: "#174082"
  console-sky: "#006EB1"
  tricolor-red: "#C80A26"
  cold-mist: "#F0F7FC"
  instrument-white: "#FCFDFE"
  hover-mist: "#E6F3FA"
  muted-mist: "#DBE7F0"
  selection-veil: "#CEE5FC"
  console-border: "#C2DDF0"
  ink: "#001423"
  dim-ink: "#43474C"
  mute-ink: "#73777D"
  signal-success: "#1F8A4C"
  signal-warning: "#C68A00"
  signal-danger: "#BA1A1A"
  pill-success-bg: "#EAF6EE"
  pill-warning-bg: "#FBF3DC"
  pill-danger-bg: "#FBE9E9"
typography:
  display:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0.04em"
  h1:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "0.04em"
  h2:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 500
    letterSpacing: "0.04em"
  h3:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "0.02em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.12em"
  eyebrow:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.18em"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontWeight: 500
    letterSpacing: "0.02em"
rounded:
  none: "0"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.console-sky}"
    textColor: "{colors.instrument-white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "32px"
  button-deep:
    backgroundColor: "{colors.sovereign-deep-blue}"
    textColor: "{colors.instrument-white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "32px"
  button-ghost:
    backgroundColor: "{colors.instrument-white}"
    textColor: "{colors.sovereign-deep-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "32px"
  button-danger:
    backgroundColor: "{colors.instrument-white}"
    textColor: "{colors.signal-danger}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 14px"
    height: "32px"
  input-search:
    backgroundColor: "{colors.hover-mist}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "5px 10px"
  input-text:
    backgroundColor: "{colors.instrument-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
  input-text-focus:
    backgroundColor: "{colors.instrument-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "5px 9px"
  input-text-disabled:
    backgroundColor: "{colors.hover-mist}"
    textColor: "{colors.mute-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
  card:
    backgroundColor: "{colors.instrument-white}"
    rounded: "{rounded.none}"
  stat-card:
    backgroundColor: "{colors.instrument-white}"
    rounded: "{rounded.none}"
    padding: "18px 20px"
  pill-success:
    backgroundColor: "{colors.pill-success-bg}"
    textColor: "{colors.signal-success}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  pill-warning:
    backgroundColor: "{colors.pill-warning-bg}"
    textColor: "{colors.signal-warning}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  pill-danger:
    backgroundColor: "{colors.pill-danger-bg}"
    textColor: "{colors.signal-danger}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  pill-info:
    backgroundColor: "{colors.hover-mist}"
    textColor: "{colors.console-sky}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  chip-default:
    backgroundColor: "{colors.instrument-white}"
    textColor: "{colors.dim-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "5px 10px"
  chip-active:
    backgroundColor: "{colors.sovereign-deep-blue}"
    textColor: "{colors.instrument-white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "5px 10px"
  tag-default:
    backgroundColor: "{colors.hover-mist}"
    textColor: "{colors.sovereign-deep-blue}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "18px"
  tag-solid:
    backgroundColor: "{colors.sovereign-deep-blue}"
    textColor: "{colors.instrument-white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "18px"
  table-header:
    backgroundColor: "{colors.sovereign-deep-blue}"
    textColor: "{colors.instrument-white}"
    typography: "{typography.label}"
    padding: "9px 12px"
  page-header:
    backgroundColor: "{colors.cold-mist}"
    textColor: "{colors.sovereign-deep-blue}"
    typography: "{typography.h1}"
    rounded: "{rounded.none}"
    padding: "0 0 14px"
  modal:
    backgroundColor: "{colors.instrument-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "18px"
  toast-success:
    backgroundColor: "{colors.pill-success-bg}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "10px 14px"
  corner-frame:
    backgroundColor: "{colors.instrument-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "24px"
---

# Design System : Hemeria

Référence unique pour **auditer** une interface existante et la **re-designer** sans quitter le système. Deux fichiers font foi : ce document (lisible par une personne ou un agent) et `DESIGN.json` (lisible par du code). Ils sont synchronisés par `scripts/validate-design.mjs` (voir §9).

## Lire ce document

- **Contexte d'usage.** Interfaces d'outils métier denses : tableaux de bord, outils internes, visualisation technique, outils de test. Pas de site grand public. On privilégie la lisibilité, une densité d'information maîtrisée, l'efficacité au clavier et la fiabilité, pas l'effet visuel.
- **Étoile polaire : « The Tricolor Console ».** Le système est conçu comme un panneau d'instruments pour ingénieurs, pas comme une bibliothèque de cartes pour managers. Il associe le poids cérémoniel du tricolore (bleu, blanc, rouge) à la posture vivante d'une console de mission : un bandeau tricolore de 4 px en tête de page, une barre latérale bleu profond, une couleur d'action bleu ciel saturée qui se lit comme un « signal actif », et un fond de travail blanc cassé teinté de bleu. Il refuse l'esthétique SaaS douce (verre dépoli, dégradés, coins arrondis, ton rassurant) comme l'excès inverse du terminal noir et ambre. Le blanc domine, le contraste reste calme, le rouge de marque n'apparaît que comme cérémonie.
- **Citer un token.** Un token se cite entre accolades, par son chemin : `{colors.ink}`, `{semantic.text.default}`, `{component.button.primary}`. Chaque chemin cité existe dans `DESIGN.json` ou dans le front matter ; la section « Registre des tokens » (§9) les liste tous.
- **Statut d'un token.** `stable` (validé, utilisé), `proposed` (proposé, en attente de décision : ne pas le présenter comme acquis), `deprecated` (à remplacer, voir `replacement`). Le statut est porté par `DESIGN.json`.
- **Hiérarchie en cas de désaccord.** Le front matter YAML (colors, typography, rounded, spacing) prévaut sur `DESIGN.json`, qui prévaut sur les extraits `html` et `css` des composants du JSON (illustratifs).
- **Source.** Ce dossier (`packages/ui/design/`) est la source ; le projet n'en dépend d'aucun autre dépôt.

## 1. Principes de design

Sept principes, chacun vérifiable. Un audit peut les utiliser comme critères de cohérence (T1 de la grille, §7).

| # | Principe | Test (réussi si…) | Contre-exemple |
|---|---|---|---|
| 1 | **Le bleu ciel, c'est l'action.** `{colors.console-sky}` signale ce que l'on peut faire ou ce qui est actif. | Tout élément en `{colors.console-sky}` est interactif ou marque un état actif/sélectionné/info. | Un bandeau décoratif en bleu ciel ; un bouton d'action en bleu profond. |
| 2 | **Le rouge, c'est la cérémonie.** `{colors.tricolor-red}` n'existe que dans le bandeau d'en-tête et le point de la marque. | Aucune occurrence de `{colors.tricolor-red}` hors de ces deux emplacements ; le danger utilise `{colors.signal-danger}`. | Un bouton « Supprimer » en rouge tricolore. |
| 3 | **Plat et angulaire.** La profondeur vient des surfaces et des bordures. | Aucun `border-radius` non nul, `box-shadow`, dégradé ni `backdrop-filter` (le lint le contrôle). | Une carte avec ombre portée et coins arrondis de 8 px. |
| 4 | **Un identifiant se lit et s'aligne.** Clés, références, UUID, horodatages et nombres de colonne sont en police mono avec chiffres tabulaires. | Tous ces éléments utilisent `{typography.mono}` ; les colonnes numériques s'alignent à droite des chiffres. | La clé `BUG-142` en police proportionnelle dans une colonne de tableau. |
| 5 | **L'information n'est jamais portée par la couleur seule.** | Chaque état (succès, danger, sélection, erreur) a un libellé, une forme ou un indice textuel en plus de sa couleur. | Une pastille verte ou rouge sans texte ; un champ en erreur signalé uniquement par une bordure rouge. |
| 6 | **Tout se fait au clavier, et le focus se voit.** | La touche `Tab` parcourt les contrôles dans l'ordre visuel ; le focus ring atteint 3:1 sur son fond ; chaque action a un équivalent clavier. | Un menu ouvert seulement au survol ; un `outline: none` sans remplacement. |
| 7 | **Chaque élément répond à une tâche.** La densité est choisie, pas subie ; l'ornement est exclu. | Pour chaque zone d'un écran, on peut nommer la tâche qu'elle sert (critère D1 de l'audit). | Quatre cartes de métriques identiques en grille « héros » sans lien avec une décision. |

### Règles non négociables

Ces interdits prolongent les principes. Les enfreindre est un constat d'audit au moins **majeur** (critère T1).

- Pas de verre dépoli : aucun `backdrop-filter`, aucune surface semi-transparente empilée sur du contenu. Le fond de modale `{overlays.scrim}` est la seule transparence autorisée.
- Pas de dégradé, ni sur les boutons, ni sur les fonds, ni sur le texte (`background-clip: text` interdit).
- Aucun `border-radius` sur un nouveau composant : pastilles, tags, avatars, puces d'état et icônes restent carrés (`{rounded.none}`).
- Aucune ombre pour l'élévation : changer le ton de surface ou renforcer la bordure (`{semantic.border.strong}` au lieu de `{semantic.border.default}`).
- Pas de gris neutre pur : tout neutre est teinté de bleu ciel à faible chroma.
- Pas de style de titre (semi-gras espacé) sur le corps de texte, les boutons, les champs, les cellules, les messages d'erreur ou les toasts.
- Pas de texte de bouton ou de cellule sous 11 px pour tout nouveau composant (voir `{fontSizes.xs}`).
- Pas de `StatCard` répétée quatre fois identiques en grille.
- Pas de carte dans une carte : une carte contient du contenu ; on structure avec un en-tête séparé.
- Pas de liseré coloré latéral sur cartes, encadrés ou éléments de liste. Exception fonctionnelle documentée : le repère de l'item actif de la barre latérale.
- Pas de texte d'interface chaleureux ou apologétique (« Désolé », « Oups », points d'exclamation).
- Le `CornerFrame` s'emploie une fois par page, sur la zone la plus importante.
- Ne pas prolonger les résidus Bootstrap (modales `modal d-block`, `toast show text-bg-*`, `btn-close`, `text-muted`, ancien `SortableTableHeader`) : toute nouvelle modale, toast ou table triable suit les patterns de ce document.


## 2. Fondations

### 2.1 Couleur

La palette est petite, froide et strictement gouvernée : une triade de marque (bleu profond, bleu ciel, rouge), une rampe neutre teintée (brume, bordure, encre) pour le contenu, et des couleurs de signal pour l'état.

**Primaires**

- **Sovereign Deep Blue** (`{colors.sovereign-deep-blue}`, `#12293A`) : couleur de gravité. Barre latérale, titres de page, fond d'en-tête de tableau, bordures fortes, variante `deep` des boutons, texte des boutons fantômes. Environ 18 à 22 % de la surface d'un écran rempli.
- **Console Sky** (`{colors.console-sky}`, `#006EB1`) : action et signal actif. Boutons primaires, liseré de 3 px des stat cards, repère de l'item actif, focus ring, pastille info (les liens utilisent `{semantic.text.link}`, sa variante assombrie). Jamais décorative.

**Tertiaires (cérémoniels)**

- **Tricolor Blue** (`{colors.tricolor-blue}`, `#174082`) : uniquement dans le bandeau d'en-tête. Non interchangeable avec les deux primaires.
- **Tricolor Red** (`{colors.tricolor-red}`, `#C80A26`) : uniquement le bandeau d'en-tête et le point de la marque dans la barre latérale. Ni action, ni danger, ni emphase ; il ne change jamais au survol.

**Neutres (tous teintés de bleu ciel)**

| Token | Hex | Usage |
|---|---|---|
| `{colors.cold-mist}` | `#F0F7FC` | Fond d'application. |
| `{colors.instrument-white}` | `#FCFDFE` | Surfaces de travail : cartes, tableaux, champs. Forme canonique `oklch(99% 0.005 235)`. |
| `{colors.hover-mist}` | `#E6F3FA` | Survol de ligne, fond du champ de recherche, survol fantôme. |
| `{colors.muted-mist}` | `#DBE7F0` | Remplissage plus profond, rare. |
| `{colors.selection-veil}` | `#CEE5FC` | Ligne active ou sélectionnée. |
| `{colors.console-border}` | `#C2DDF0` | Bordure 1 px des cartes, tableaux, champs, barres d'outils. |
| `{colors.ink}` | `#001423` | Texte courant. |
| `{colors.dim-ink}` | `#43474C` | Texte secondaire. |
| `{colors.mute-ink}` | `#73777D` | Primitive conservée. En texte on emploie `{semantic.text.mute}` (`{colors.mute-ink-aa}`) : la primitive seule n'atteint pas 4,5:1 sur les fonds clairs. |

**Signal (état, jamais décor).** `{colors.signal-success}` sur `{colors.pill-success-bg}`, `{colors.signal-warning}` sur `{colors.pill-warning-bg}`, `{colors.signal-danger}` sur `{colors.pill-danger-bg}`. L'état **info** n'a pas de couleur propre : il emploie `{colors.console-sky}` sur `{colors.hover-mist}` (usage volontaire : « regardez ici »). L'état **neutre** (valeur inconnue) emploie `{colors.instrument-white}`, `{colors.sovereign-deep-blue}` en bordure et `{colors.dim-ink}` en texte ; il ne sert jamais de valeur par défaut quand on a oublié de traiter une valeur.

#### 2.1.1 Couleurs sémantiques et thèmes

Les composants ne citent pas les primitives directement : ils passent par la couche **sémantique**, qui possède les mêmes clés dans les deux thèmes. Le thème clair est la charte actuelle. Le thème sombre est **proposé** et n'emploie que des valeurs des rampes tonales de `DESIGN.json` (`extensions.colorMeta`) : aucune teinte nouvelle.

| Groupe | Clés | Rôle |
|---|---|---|
| Surface | `{semantic.surface.app}`, `{semantic.surface.default}`, `{semantic.surface.hover}`, `{semantic.surface.muted}`, `{semantic.surface.selected}`, `{semantic.surface.inverse}`, `{semantic.surface.scrim}` | Fonds, du plus lointain au plus engagé. |
| Texte | `{semantic.text.default}`, `{semantic.text.secondary}`, `{semantic.text.mute}`, `{semantic.text.mute-aa}`, `{semantic.text.heading}`, `{semantic.text.link}`, `{semantic.text.link-aa}`, `{semantic.text.on-inverse}`, `{semantic.text.on-action}` | Textes selon le fond. `mute`, `link` et `state.*.fg` sont déjà les variantes accessibles (4,5:1) ; `mute-aa` et `link-aa` en sont des alias de compatibilité. |
| Bordure | `{semantic.border.default}`, `{semantic.border.strong}`, `{semantic.border.control}`, `{semantic.border.focus}`, `{semantic.border.danger}` | `control` est le contour d'un champ qui atteint 3:1. |
| Action | `{semantic.action.primary.bg}`, `{semantic.action.deep.bg}`, `{semantic.action.ghost.fg}`, `{semantic.action.danger.fg}` | Boutons (voir 3.1). |
| État | `{semantic.state.success.bg}`, `{semantic.state.warning.bg}`, `{semantic.state.danger.bg}`, `{semantic.state.info.bg}`, `{semantic.state.neutral.bg}` | Chaque état a `bg`, `fg` (texte accessible), `fg-aa` (alias) et `border`. |
| Focus | `{semantic.focus.ring}`, `{semantic.focus.ring-on-inverse}` | Anneau de focus sur fond clair, et sur surface inverse. |

#### 2.1.2 Couleurs dérivées

Athena applique déjà ces assombrissements dans son CSS ; ils sont formalisés ici et adoptés comme valeurs sémantiques par défaut (journal D-013). Statut `proposed` tant que l'adoption n'est pas validée ; les couleurs primitives d'origine restent inchangées.

`{colors.mute-ink-aa}`, `{colors.signal-success-text}`, `{colors.signal-warning-text}`, `{colors.signal-danger-text}`, `{colors.console-sky-text}`. Les superpositions `{overlays.on-inverse-subtle}`, `{overlays.on-inverse-hover}`, `{overlays.on-inverse-border}`, `{overlays.sky-tint-active}` et `{overlays.scrim}` donnent un nom aux valeurs `rgba` du CSS.

#### 2.1.3 Contrastes

Les ratios sont calculés (WCAG 2.x, luminance relative sRGB) et listés paire par paire dans `DESIGN.json` (`contrast.pairs`, 64 paires, thèmes clair et sombre). **Toutes les paires par défaut atteignent leur seuil** ; `validate-design.mjs --strict` refuse tout écart. Thème clair, paires principales :

| Paire | Ratio | Seuil | Résultat |
|---|---|---|---|
| `{semantic.text.default}` sur `{semantic.surface.default}` | 18,34 | 4,5 | AAA |
| `{semantic.text.secondary}` sur `{semantic.surface.default}` | 9,19 | 4,5 | AAA |
| `{semantic.text.mute}` sur `{semantic.surface.default}` | 7,58 | 4,5 | AAA |
| `{semantic.text.mute}` sur `{semantic.surface.hover}` | 6,83 | 4,5 | AA |
| `{semantic.text.link}` sur `{semantic.surface.selected}` | 5,34 | 4,5 | AA |
| `{semantic.text.on-action}` sur `{semantic.action.primary.bg}` | 5,33 | 4,5 | AA |
| `{semantic.text.on-inverse}` sur `{semantic.surface.inverse}` | 14,69 | 4,5 | AAA |
| Texte de pastille succès, avertissement, danger, info | ≥ 6,1 | 4,5 | AA |
| `{semantic.border.control}` sur `{semantic.surface.default}` (non textuel) | 4,42 | 3 | AA |
| `{semantic.focus.ring}` sur `{semantic.surface.default}` | 5,33 | 3 | AA |
| `{semantic.focus.ring-on-inverse}` sur `{semantic.surface.inverse}` | 14,69 | 3 | AA |

Écarts de la version d'origine et leur résolution :

| Avant | Ratio | Résolution |
|---|---|---|
| `{colors.mute-ink}` en texte sur fond clair | 4,42 / 4,16 / 3,98 | `{semantic.text.mute}` = `{colors.mute-ink-aa}` |
| `{colors.console-sky}` en lien sur Selection Veil | 4,20 | `{semantic.text.link}` = `{colors.console-sky-text}` |
| Texte de pastille succès et avertissement | 3,94 / 2,69 | `{semantic.state.success.fg}` et `{semantic.state.warning.fg}` (variantes `-text`) |
| `{semantic.border.default}` comme contour de champ | 1,38 | `{semantic.border.control}` ; `{semantic.border.default}` reste réservé aux filets décoratifs (exemptés, WCAG 1.4.11) |
| Focus ring `{semantic.focus.ring}` sur surface inverse | 2,75 | `{semantic.focus.ring-on-inverse}` obligatoire sur surface inverse |

### 2.2 Typographie

Une seule famille fait tout, ce qui garde le système sobre : IBM Plex Sans, une grotesque au caractère technique, lisible à 13 px. Les titres se distinguent par le poids (semi-gras) et l'espacement, les labels par le gras et les capitales espacées. IBM Plex Mono porte les références et les nombres tabulaires qui sont le produit.

| Style | Spécification | Usage |
|---|---|---|
| `{typography.display}` | Plex Sans 600, 32 px / 1,15, `0.04em` | Plus grands titres, rare (tableau de bord, contextes héros). `{colors.sovereign-deep-blue}`. |
| `{typography.h1}` | Plex Sans 600, 26 px / 1,15, `0.04em` | Titre de page. `{colors.sovereign-deep-blue}`. |
| `{typography.h2}` | Plex Sans 500, 18 px, `0.04em` | Titres de section. `{colors.sovereign-deep-blue}`. |
| `{typography.h3}` | Plex Sans 600, 15 px, `0.02em` | Sous-sections, titres de modale. `{colors.ink}` (le titre descend d'un cran). |
| `{typography.body}` | Plex Sans 400, 13 px / 1,45 | Texte courant, valeurs de formulaire, cellules. `{colors.ink}`. Prose limitée à 65-75 caractères (`{sizes.prose-max}`) ; tableaux et panneaux denses peuvent dépasser. |
| `{typography.label}` | Plex Sans 700, 11 px, `0.12em`, MAJUSCULES | Titres de carte, boutons, pastilles, chips, en-têtes de tableau. |
| `{typography.eyebrow}` | Plex Sans 700, 11 px, `0.18em`, MAJUSCULES | Ligne au-dessus du titre de page (« Mission Console »). `{colors.mute-ink}`. |
| `{typography.mono}` | Plex Mono 500, `0.02em`, chiffres tabulaires | Identifiants, références, codes, horodatages. |

Échelle des tailles de police : `{fontSizes.2xs}` 10 px (historique, plus utilisé par les composants), `{fontSizes.xs}` 11 px, `{fontSizes.sm}` 12 px, `{fontSizes.md}` 13 px, `{fontSizes.lg}` 15 px, `{fontSizes.xl}` 18 px, `{fontSizes.2xl}` 26 px, `{fontSizes.3xl}` 32 px, `{fontSizes.stat}` 30 px (valeur de stat card). `{fontSizes.micro}` (9,5 px, en-têtes de tableau) est **déprécié** : viser `{fontSizes.xs}`.

**Règles nommées**

- **Identifiant en mono.** Toute référence, clé, UUID, horodatage et nombre tabulaire est en IBM Plex Mono avec `font-variant-numeric: tabular-nums`. Non négociable.
- **Poids des titres.** Les titres (Display, H1 à H3) sont en Plex Sans 500-600, `0.02em` à `0.04em`, en bleu profond. Capitales espacées et capitales sont réservées aux labels et eyebrows.
- **Capitales espacées.** Tout texte en capitales utilise `0.12em` à `0.18em` d'espacement : sans espacement il crie, avec il fait officiel. Les deux vont ensemble (`{letterSpacings.label}`, `{letterSpacings.pill}`, `{letterSpacings.eyebrow}`).

### 2.3 Espacement, tailles et densité

Échelle d'espacement : `{spacing.xs}` 4 px, `{spacing.sm}` 8 px, `{spacing.md}` 12 px, `{spacing.lg}` 20 px, `{spacing.xl}` 24 px (stables). Proposés : `{spacing.2xs}` 2 px, `{spacing.base}` 16 px, `{spacing.2xl}` 32 px, `{spacing.3xl}` 48 px. Le CSS emploie aussi 14 et 18 px (padding des boutons, des stat cards) : ces valeurs hors échelle sont portées par les tokens de composant, pas par l'échelle.

Hauteurs de contrôle : `{sizes.control-sm}` 26 px, `{sizes.control-md}` 32 px, `{sizes.control-lg}` 40 px. Bordures : `{borderWidths.hairline}` 1 px, `{borderWidths.strong}` 2 px, `{borderWidths.accent}` 3 px, `{borderWidths.stripe}` 4 px. Largeurs de dialogue : `{sizes.dialog-sm}`, `{sizes.dialog-md}`, `{sizes.dialog-lg}`.

**Breakpoints.** `{breakpoints.md}` 768 px (stable) : au-dessous, la barre latérale devient un tiroir. Proposés : `{breakpoints.sm}` 480 px, `{breakpoints.lg}` 1024 px, `{breakpoints.xl}` 1440 px. Le système est pensé pour le poste de travail ; le mobile doit rester utilisable en lecture et en actions principales, pas optimisé.

**Densité.** Trois niveaux, qui changent espacements et hauteurs, jamais les couleurs ni les polices sous 11 px.

| Niveau | Contrôle | Padding de ligne | Statut | Usage |
|---|---|---|---|---|
| `{density.normal}` | 32 px | 9 px | stable | Défaut. |
| `{density.compact}` | 26 px | 5 px | proposed | Tables de centaines de lignes. Cible minimale de 24 px respectée. |
| `{density.comfortable}` | 40 px | 13 px | proposed | Écrans tactiles, usage occasionnel. |

Couches (`z-index`) : `{zIndex.base}`, `{zIndex.sticky}`, `{zIndex.overlay}` (modale), `{zIndex.toast}`.

### 2.4 Iconographie

- Jeu unique : **Lucide**, tracé de 2 px, `stroke-linecap: round` d'origine, `currentColor` pour la couleur. Pas de pictogrammes colorés ni d'émojis.
- Tailles : 13 px dans un champ ou un bouton, 14 px pour les fermetures, 18 px dans un toast, 24 px dans un état vide.
- Un encadré d'icône est un carré de bordure 1 px ; il n'est jamais rond.
- Une icône seule (bouton-icône) porte un nom accessible (`aria-label`) et un `title`. Une icône qui accompagne un libellé est décorative (`aria-hidden="true"`).
- Les drapeaux de langue sont des SVG ; les émojis de drapeau ne s'affichent pas sur toutes les plateformes.

### 2.5 Mouvement

- Une seule transition : `{durations.fast}` (120 ms) en `{easings.linear}`, sur `filter`, `background` et `color`. Pas de `transform`, pas d'orchestration, pas de rebond.
- Le toast apparaît par fondu de 120 ms ; il disparaît après `{durations.toast}` (5 s), en pause au survol.
- Si `prefers-reduced-motion: reduce`, la durée passe à `{durations.instant}` (proposé).
- Un mouvement n'est jamais le seul indice d'un changement d'état.

### 2.6 Élévation

Le système est **plat par doctrine**. La profondeur passe, dans cet ordre, par :

1. **Les couches tonales** : Cold Mist (page) → Instrument White (cartes, tableaux) → Hover Mist (interaction) → Selection Veil (sélection). On change la température de la surface, on n'ajoute pas de relief.
2. **Les bordures de 1 px** en `{semantic.border.default}` (légère) ou `{semantic.border.strong}` (forte). La pile barre d'outils / tableau / pied se rejoint avec `margin-bottom: -1px` pour former un cadre continu.
3. **Une seule décoration signature** : le liseré de 3 px `{semantic.border.focus}` en haut des stat cards. L'ajouter ailleurs la dilue.

Le **CornerFrame** (quatre repères de 12 px en `{colors.sovereign-deep-blue}`, tracé de 2 px) est une signature lourde : une fois par page, sur la zone la plus importante. Les `shadows` du JSON restent vides.


## 3. Composants

Tous les composants sont rectangulaires, bordés de 1 px, sans ombre, et lisent leurs couleurs dans la couche sémantique. Chacun a des états explicites (`{states.hover}`, `{states.focus}`, `{states.disabled}`…). Les états transversaux sont définis une fois : `{states.default}`, `{states.hover}`, `{states.active}` (proposé), `{states.focus}`, `{states.disabled}`, `{states.loading}` (proposé), `{states.error}`, `{states.selected}`.

### 3.1 Bouton

- **Usage.** Déclencher une action. Un seul bouton primaire par zone d'action.
- **Anatomie.** Libellé en capitales (`{typography.label}`, 12 px à l'usage, `{fontSizes.sm}`), icône facultative de 13 px à gauche, `padding: 0 14px`, bordure 1 px de la couleur de fond.
- **Variantes.**
  - `{component.button.primary}` : fond `{semantic.action.primary.bg}`, texte `{semantic.action.primary.fg}`. Action par défaut.
  - `{component.button.deep}` : fond `{semantic.action.deep.bg}`. Actions de plus grande gravité (« Confirmer la migration »).
  - `{component.button.ghost}` : transparent, texte et bordure `{semantic.action.ghost.border}`. Actions secondaires (Exporter, Annuler).
  - `{component.button.danger}` : transparent, texte et bordure `{semantic.action.danger.border}` ; plein au survol. Jamais en rouge tricolore.
  - Tailles : `{sizes.control-sm}` 26 px, `{sizes.control-md}` 32 px, `{sizes.control-lg}` 40 px.
- **États.** Survol : `filter: brightness(1.07)` (plein) ou `{semantic.surface.hover}` (fantôme). Appui : `brightness(0.93)` (proposé). Focus : `{states.focus}`. Désactivé : `{opacities.disabled}` et `not-allowed`, sans changement de couleur. Chargement : `aria-busy`, désactivé, libellé suivi de « … ».
- **À faire.** Verbe à l'infinitif en capitales (« ENREGISTRER »). Placer l'action destructrice à gauche du pied de modale, l'annulation puis la confirmation à droite. Expliquer un bouton désactivé par un texte voisin.
- **À ne pas faire.** Deux boutons primaires côte à côte. Un bouton primaire pour une action destructrice. Un libellé vague (« OK »). Un bouton qui n'est qu'une icône sans nom accessible.

### 3.2 Pastille de statut (`StatusPill`)

- **Usage.** Exprimer un état (succès, avertissement, danger, info, neutre) dans une liste, un tableau, un en-tête.
- **Anatomie.** Rectangle de `padding: 2px 8px`, bordure 1 px de la couleur de signal, point **carré** de 7 px en `currentColor`, libellé en capitales 11 px (`{fontSizes.xs}`, `{letterSpacings.pill}`).
- **Variantes.** `success`, `warning`, `danger`, `info`, `default` (neutre : aucune des quatre ne convient ; jamais un repli « on a oublié de traiter la valeur »). On n'invente pas d'autre type. Le texte utilise `{semantic.state.success.fg}` et ses équivalents, qui atteignent 4,5:1.
- **États.** Non interactive : pas de survol.
- **À faire.** Un libellé lisible (« En revue », « Bloqué »). Le même libellé que dans le texte de la page.
- **À ne pas faire.** Une pastille sans texte. Une couleur seule pour distinguer deux états. Une pastille ronde.

### 3.3 Tag

- **Usage.** Catégoriser (type, famille, étiquette).
- **Anatomie.** 18 px de haut (`{sizes.tag-height}`), `padding: 0 6px`, bordure 1 px, capitales 11 px (`{letterSpacings.tag}`).
- **Variantes.** `default` (fond `{semantic.surface.hover}`, texte `{semantic.text.heading}`), `solid` (fond `{semantic.surface.inverse}`), `accent` (fond `{semantic.action.primary.bg}` : filtre actif), `ghost` (transparent, texte `{semantic.text.secondary}`).
- **À faire.** Garder un tag court (un mot). **À ne pas faire.** Un tag cliquable sans nom accessible ; il n'est pas une cible de 24 px : s'il devient interactif, il doit atteindre `{sizes.touch-target-min}`.

### 3.4 Chip de filtre (`FilterChip`)

- **Usage.** Exprimer un filtre appliqué dans une barre d'outils (`Type : BUG`).
- **Anatomie.** Libellé + valeur en capitales, croix d'effacement avec `aria-label`. Défaut : fond `{semantic.surface.default}`, bordure `{semantic.border.default}`, texte `{semantic.text.secondary}`. Actif : fond `{semantic.surface.inverse}`, texte `{semantic.text.on-inverse}`.
- **À faire.** Offrir un moyen unique de tout réinitialiser. **À ne pas faire.** Empiler plus de six chips sans regroupement.

### 3.5 Champ de recherche (`SearchInput`)

- **Usage.** Rechercher dans une liste ou naviguer.
- **Anatomie.** Fond `{semantic.surface.hover}`, icône de loupe 13 px, champ, indice du raccourci (`⌘K` ou `Ctrl+K`, mono 11 px). Le raccourci de recherche est toujours visible dans le cadre.
- **États.** Focus : bordure `{semantic.border.focus}`. Le texte d'aide et le placeholder utilisent `{semantic.text.mute-aa}`.
- **À ne pas faire.** Supprimer l'étiquette accessible parce qu'une loupe est visible.

### 3.6 Champ de formulaire (texte, liste, zone de texte)

- **Usage.** Saisir une valeur.
- **Anatomie.** Étiquette **toujours visible** au-dessus (11 px, capitales, `{semantic.text.secondary}`), champ de `padding: 6px 10px`, texte 13 px, texte d'aide ou d'erreur de 11 px sous le champ. Liste : chevron Lucide 14 px à droite ; panneau d'options net, `{semantic.border.default}`, survol `{semantic.surface.hover}`. Zone de texte : poignée de redimensionnement native conservée.
- **États.** Repos : bordure `{semantic.border.control}`. Survol : `{semantic.border.strong}`. Focus : bordure 2 px `{semantic.border.focus}` (padding réduit de 1 px pour éviter tout décalage), pas de halo. Erreur : bordure `{semantic.border.danger}` + ligne d'aide `{semantic.state.danger.fg-aa}` reliée par `aria-describedby` ; le fond ne change pas. Désactivé : fond `{semantic.surface.hover}`, texte `{semantic.text.mute}`.
- **Contour.** Le contour d'un champ utilise `{semantic.border.control}` (3:1 minimum, WCAG 1.4.11). `{semantic.border.default}` (1,38:1) est réservé aux filets décoratifs de cartes et de tableaux.
- **À faire.** Indiquer le format attendu en aide, pas dans le placeholder. Identifier les champs obligatoires par le mot « obligatoire », pas par un astérisque seul.
- **À ne pas faire.** Placeholder en guise d'étiquette. Message d'erreur uniquement par la couleur.

### 3.7 Carte (`Card`)

- **Usage.** Regrouper un bloc de contenu.
- **Anatomie.** Bordure 1 px `{semantic.border.default}`, fond `{semantic.surface.default}`. En-tête facultatif : `padding: 10px 14px`, filet inférieur, titre en label à gauche, méta en mono à droite.
- **À ne pas faire.** Imbriquer une carte dans une carte (le composant lève une erreur).

### 3.8 Stat card (`StatCard`) : signature

- **Usage.** Présenter une métrique de tableau de bord.
- **Anatomie.** `padding: 18px 20px`, liseré supérieur de 3 px `{semantic.border.focus}`, label de 11 px, valeur de 30 px (`{fontSizes.stat}`, tabulaire), delta en mono 11 px, icône dans un carré de 1 px de 40 px.
- **À ne pas faire.** Répéter la carte à l'identique quatre fois ; la valeur doit appeler une décision.

### 3.9 Tableau et en-tête triable

- **Usage.** Parcourir, comparer, trier des enregistrements.
- **Anatomie.** En-tête `{semantic.surface.inverse}`, texte `{semantic.text.on-inverse}`, capitales espacées (`{component.table.header}`, 11 px, `{fontSizes.xs}` ; l'ancienne valeur de 9,5 px, `{fontSizes.micro}`, est dépréciée). Corps 12 px, bordures 1 px. Cellule `mono` pour tout identifiant (`{component.table.cell-mono}`).
- **États.** Survol de ligne : `{semantic.surface.hover}`. Ligne sélectionnée : `{semantic.surface.selected}` + `aria-selected`, avec un indice non coloré (case cochée ou pastille). En-tête triable : clic ou `Entrée` / `Espace` cycle `aucun → croissant → décroissant → aucun`, `aria-sort` mis à jour ; indicateur de 5 px (paire de chevrons en repos, triangle en `{semantic.border.focus}` actif).
- **En-tête collant.** L'en-tête du tableau reste visible au défilement, juste sous l'en-tête de page (la hauteur de celui-ci est publiée par `PageHeader` dans `--ath-pageheader-h`).
- **À faire.** Aligner les nombres, garder l'en-tête visible au défilement (`{zIndex.sticky}`), limiter la largeur des colonnes de texte avec troncature et accès au texte complet. **À ne pas faire.** Trier sans indicateur ; masquer une colonne sans le dire.

### 3.10 Onglets

- **Usage.** Passer d'une vue à une autre dans le même objet.
- **Anatomie.** Filet de 2 px `{semantic.border.default}`, onglet actif souligné de 2 px `{semantic.border.focus}` avec texte `{semantic.text.heading}`, inactifs en `{semantic.text.mute-aa}`, 11 px capitales (`{component.tab}`).
- **Clavier.** `role="tablist"`, flèches gauche et droite entre onglets, `Tab` entre dans le panneau. **À ne pas faire.** Des onglets pour une navigation entre pages.

### 3.11 Modale

- **Usage.** Une décision ou une saisie qui doit bloquer le reste de l'écran. Pas pour afficher une simple information.
- **Anatomie.** Fond `{semantic.surface.scrim}` (sans flou), dialogue `{semantic.surface.default}` bordé de `{semantic.border.strong}`, largeurs 480 / 640 / 880 px, en-tête `{semantic.surface.inverse}` avec titre H3 et fermeture carrée de 24 px, corps de 18 px, pied avec filet. Empilement `{zIndex.overlay}`.
- **Comportement.** `role="dialog"`, `aria-modal="true"`, `aria-labelledby`. `Échap`, clic sur le fond et la croix ferment. Piège à focus : le focus entre sur le premier contrôle et revient au déclencheur à la fermeture.
- **Confirmation destructive** (`{component.confirm-dialog}`) : titre nommant l'objet, corps disant la conséquence, annulation (fantôme) puis confirmation en `{component.button.danger}` ; le navigateur (`window.confirm`) n'est jamais utilisé.
- **À faire.** Pied : annulation (fantôme) puis confirmation (primaire) à droite ; action destructrice avec le bouton danger. **À ne pas faire.** Une modale dans une modale ; une modale qui s'ouvre seule sans action de l'utilisateur.

### 3.12 Toast

- **Usage.** Confirmer une action asynchrone ou signaler un événement qui n'exige pas de décision.
- **Anatomie.** Haut à droite, à 16 px du bord, 8 px entre toasts, `{sizes.toast-min}` à `{sizes.toast-max}` de large. Icône de 18 px, message, croix de 14 px. Fond et bordure de l'état (`{semantic.state.success.bg}`, etc.). Un toast `danger` reste jusqu'à sa fermeture ; les autres disparaissent après `{durations.toast}`, en pause au survol et au focus, fondu de 120 ms. Zone `aria-live="polite"` (`role="alert"` pour les erreurs).
- **À faire.** Phrase courte sans point d'exclamation (« Préférences enregistrées. »). **À ne pas faire.** Un toast pour une erreur de formulaire (elle reste au champ) ; un toast qui disparaît avant d'avoir été lu quand il porte une information critique.

### 3.13 État vide

- **Usage.** Une liste ou un tableau sans résultat.
- **Anatomie.** Centré, 60 px de marge verticale minimale, icône de 24 px dans un carré de 1 px de 48 px, eyebrow de la catégorie, H3 de la condition, un bouton fantôme facultatif, 280 px de large au plus. Pas d'illustration ni d'émoji.

### 3.14 Barre latérale

- **Usage.** Navigation principale.
- **Anatomie.** Fond `{semantic.surface.inverse}`, texte blanc à 70 % (plein si actif). Marque en tête (point en `{colors.tricolor-red}`, seul usage hors bandeau). Item actif : repère de 3 px `{semantic.border.focus}` + `{overlays.sky-tint-active}` + `aria-current="page"` (exception fonctionnelle au refus des liserés). Pied : avatar carré de 28 px, nom et rôle, actions en boutons-icônes carrés de 28 px (`{sizes.icon-button}`). Repliée : 64 px (`{sizes.sidebar-collapsed}`), libellés masqués, icônes avec `title`.
- **Hauteur.** Elle est limitée à la fenêtre visible (`position: sticky`, `top: 0`, `100dvh`, sans marge du navigateur) : la liste de navigation défile dans la barre si la fenêtre est basse, et le pied utilisateur reste visible. Sous `{breakpoints.md}` la barre redevient un bloc en flux, repliable.
- **Atténuation.** Les textes atténués de la barre (items inactifs 70 %, rôle 65 %, sous-titre 75 %) sont des couleurs mélangées avec `color-mix`, pas des `opacity` (contrastes mesurables : 7,87:1, 7,02:1, 8,86:1).
- **Clavier.** Le focus ring des items utilise `{semantic.focus.ring-on-inverse}` sur fond bleu profond.

### 3.15 En-tête de page (`PageHeader`) : signature

- **Anatomie.** Bandeau vertical tricolore de 4 px (bleu / blanc bordé / rouge, trois parties égales), eyebrow facultatif, titre H1, sous-ligne facultative, actions à droite, filet inférieur de 1 px, 14 px de padding et 20 px de marge basse. Chaque page en commence par un. L'en-tête reste visible au défilement (`position: sticky`, `top: 0`, au-dessus du contenu) ; sous `{breakpoints.md}` il reprend le flux normal pour ne pas occuper l'écran.

### 3.16 Lien d'évitement et entrée d'aide

- **Lien d'évitement** (`{component.skip-link}`) : premier élément focalisable de chaque page, invisible au repos, visible au focus (bordure 2 px `{semantic.border.strong}`, `{states.focus}`). Il place le focus sur le contenu principal (`main`, `tabindex="-1"`) et évite les arrêts de tabulation de la navigation.
- **Entrée d'aide** (`{component.help-entry}`) : dernière entrée de la navigation, à la même place sur toutes les pages ; la page liste les raccourcis clavier, la syntaxe de recherche et les rôles.
- **Tableau** (`{component.table.row.clip}`, proposé) : un titre long est tronqué sur une ligne avec son texte complet dans `title` ; une clé ne se coupe jamais (`white-space: nowrap`).

### 3.17 Disposition de la vue détails

- **Usage.** Choisir comment les attributs d'un tracker s'affichent sur la fiche d'un artefact : sections titrées, attributs sur 1, 2 ou 3 colonnes.
- **Grille** (`{component.layout-grid}`) : 3 colonnes, une seule colonne sous `{breakpoints.md}`. Un attribut absent de la disposition est ajouté à la suite : un champ créé plus tard n'est jamais masqué.
- **Éditeur** (`{component.layout-editor}`). Automatique par défaut (titre en pleine largeur, attributs courts sur 1 colonne, textes longs en pleine largeur) ; « Personnaliser » ouvre un aperçu fidèle, avec les mêmes grille et gabarits que la fiche.
- **Interactions.** Glisser un attribut pour le déplacer ; chaque déplacement a un équivalent bouton (reculer, avancer, largeur 1/3 2/3 3/3, déplacer vers une section, retirer), conformément à WCAG 2.5.7. Les attributs non placés sont listés avec un bouton « Placer ».
- **À ne pas faire.** Obliger à configurer la disposition ; proposer le glisser-déposer sans bouton ; empiler les sections sans titre.

### 3.18 Corner frame

Voir 2.6. Quatre repères de 12 px, tracé de 2 px, une fois par page.


## 4. Accessibilité

Cible minimale : **WCAG 2.2 niveau AA**. Un écart se traite comme un constat d'audit (critères A1 à A5) ; les paires par défaut du système atteignent toutes leur seuil (2.1.3 et `contrast.pairs`) ; un écart ajouté plus tard se consigne en `known-issue` avec sa remédiation et fait échouer `validate-design --strict`.

### 4.1 Contrastes

| Élément | Seuil | Référence |
|---|---|---|
| Texte courant et petit (< 18,66 px gras ou 24 px) | 4,5:1 | 1.4.3 |
| Grand texte | 3:1 | 1.4.3 |
| Contour d'un champ, icône porteuse de sens, focus ring, état d'un contrôle | 3:1 | 1.4.11 |
| Séparateur purement décoratif | exempté | 1.4.11 |

Règles : le texte secondaire, d'aide, de lien et de pastille emploie `{semantic.text.mute}`, `{semantic.text.link}` et `{semantic.state.danger.fg}` (et équivalents), qui atteignent 4,5:1 ; le contour d'un champ emploie `{semantic.border.control}` ; sur fond bleu profond le focus ring est `{semantic.focus.ring-on-inverse}`. Pour toute combinaison absente du JSON, calculer le ratio avant de la livrer et l'ajouter à `contrast.pairs`.

### 4.2 Clavier

- Tout se fait au clavier : aucune action réservée à la souris (principe 6).
- **Ordre de focus** = ordre visuel et logique de lecture : barre latérale, en-tête de page, barre d'outils, contenu principal, pied. Pas de `tabindex` positif.
- **Focus visible** sur chaque contrôle (`:focus-visible`) : `{states.focus}`, 2 px, décalage 2 px, 3:1 minimum. Jamais `outline: none` sans remplacement.
- Raccourcis : `Ctrl+K` / `⌘K` ouvre la palette de commandes (toujours indiquée dans le cadre) ; `Échap` ferme modale, palette et menu ; flèches dans les onglets, listes et palette ; `Entrée` / `Espace` activent boutons et en-têtes triables. Un raccourci ne remplace pas une commande visible.
- Piège à focus dans les modales, restitution du focus au déclencheur.
- Pas de piège clavier : on peut toujours sortir d'un composant avec `Tab` ou `Échap`.

### 4.3 Lecteurs d'écran et sémantique

- Utiliser l'élément natif avant un rôle ARIA : `button`, `a`, `table` avec `th scope="col"`, `label` associé par `for`.
- Un seul `h1` par page (le titre de `PageHeader`), niveaux de titre sans saut.
- Régions : `nav` avec `aria-label`, `main`, `aside`. Page courante : `aria-current="page"`.
- Boutons-icônes : `aria-label` et `title`. Icônes décoratives : `aria-hidden="true"`.
- Annonces : `role="status"` / `aria-live="polite"` pour les confirmations, `role="alert"` pour les erreurs ; état de chargement avec `aria-busy`.
- Erreur de champ reliée par `aria-describedby`, champ marqué `aria-invalid="true"`.
- Un tableau de données porte un nom (`aria-label` ou légende) ; un diagramme (workflow, jauge) a une alternative textuelle équivalente (liste des transitions, valeur chiffrée).

### 4.4 Cibles et zones cliquables

- Cible minimale **24 × 24 px** (`{sizes.touch-target-min}`, WCAG 2.5.8) pour tout contrôle interactif ; boutons : 26, 32 ou 40 px de haut ; boutons-icônes : 28 px (24 px au minimum, à l'espacement près).
- Un contrôle plus petit que 24 px est admis seulement s'il est séparé de ses voisins par l'espace nécessaire ou s'il existe une autre commande équivalente.
- Les éléments non interactifs (tags, pastilles) n'ont pas de seuil, mais ne doivent pas ressembler à des boutons.

### 4.5 Ne jamais coder l'information par la couleur seule

- Un état = couleur **et** texte (pastille avec libellé), ou couleur **et** forme (point carré + mot).
- Un champ en erreur : bordure + message textuel.
- Une ligne sélectionnée : fond + indice textuel ou case cochée + `aria-selected`.
- Un graphique : étiquettes, motifs ou valeurs en plus des teintes ; le workflow distingue les catégories par la couleur **et** le libellé du statut, les transitions libres par le tiret.
- Un lien se reconnaît à autre chose que sa couleur (soulignement).

### 4.6 Mouvement, temps et autres critères WCAG 2.2

- `prefers-reduced-motion` respecté (bonne pratique, WCAG 2.3.3).
- Délai d'un toast : 5 s minimum, suspendu au survol et au focus ; un message important reste disponible (journal, page).
- Pas de contenu qui clignote.
- **2.4.11 Focus non masqué** : le focus ring n'est pas masqué par un en-tête ou une barre fixe.
- **3.3.7 Saisie redondante** : ne pas redemander une information déjà fournie dans le même parcours.
- **3.2.6 Aide cohérente** : l'accès à l'aide occupe la même place d'une page à l'autre.
- **2.5.7 Mouvements de glissement** : tout glisser-déposer a une alternative sans glisser (le board propose « Déplacer vers »).
- Texte redimensionnable à 200 % et reflow à 320 px de large sans défilement horizontal des pages de lecture.


## 5. Patterns d'écran

Chaque pattern combine des composants de la §3 ; il ne crée pas de style propre.

### 5.1 Formulaire

- Une colonne, étiquettes au-dessus, regroupement par sections à titre H3. Deux colonnes seulement quand les champs sont courts et liés (date de début, date de fin).
- Les champs obligatoires portent le mot « obligatoire » dans l'étiquette ; les facultatifs ne sont pas marqués.
- **Validation** à la sortie du champ pour le format, à l'envoi pour la cohérence ; ne jamais bloquer la frappe. Les erreurs restent attachées aux champs (3.6) et un résumé (`role="alert"`) en tête du formulaire liste les champs fautifs avec des liens vers eux.
- **Envoi.** Le bouton primaire est unique, en bas à droite ; il passe en `{states.loading}` pendant l'envoi. En cas de succès : toast de confirmation ou retour à la page parente. En cas d'échec : le formulaire garde les valeurs saisies.
- Une action destructrice ne partage pas la ligne du bouton primaire (voir 5.7).

### 5.2 Tableau de données

- Barre d'outils au-dessus (recherche, chips de filtres, actions), tableau, pied avec pagination ou total, empilés avec `margin-bottom: -1px`.
- Colonnes : identifiant à gauche en mono, libellés, état en pastille, nombres alignés à droite en mono, actions à droite. Tri sur au moins l'identifiant, l'état et la date.
- Pagination par pages de 25 lignes par défaut ; indiquer « 26-50 / 312 » ; au-delà d'un plafond de comptage, afficher « 10 000+ ».
- Sélection de lignes : case à cocher en première colonne, barre d'actions groupées qui apparaît à la sélection.
- **Contenu long** : troncature à une ligne avec `title` et accès au texte complet ; jamais de débordement horizontal de la page. **Beaucoup de colonnes** : défilement horizontal du tableau seul, première colonne figée.
- Chargement : voir 5.5. Vide : voir 5.4.

### 5.3 Tableau de bord

- Un en-tête de page avec eyebrow, puis une composition **asymétrique** : un indicateur principal large et des secondaires plus petits, jamais une grille de tuiles identiques.
- Chaque bloc répond à une question (« combien est ouvert ? », « où est le goulot ? ») et renvoie par un lien vers la liste filtrée correspondante.
- Un diagramme a un titre, une unité, une alternative tabulaire ou textuelle, et ne se lit pas par la couleur seule (4.5).
- Fraîcheur : afficher l'heure de la dernière mise à jour quand les données se rafraîchissent seules.
- `CornerFrame` : une seule fois, sur la zone la plus importante.

### 5.4 État vide

Trois cas, trois messages distincts : **aucune donnée encore** (expliquer ce que l'on peut créer et proposer l'action), **aucun résultat pour ces filtres** (rappeler les filtres, bouton « Réinitialiser les filtres »), **accès non autorisé** (dire quel rôle manque). Structure : voir 3.13.

### 5.5 Chargement

- Moins de 300 ms : rien. De 300 ms à 1 s : le contrôle déclencheur passe en `{states.loading}`. Au-delà de 1 s : un état de chargement dans la zone concernée, avec `role="status"` et le texte « Chargement… ».
- On conserve l'ancien contenu visible (grisé via l'attribut `aria-busy`) plutôt que de vider la zone lors d'un rafraîchissement.
- Pas de spinner rotatif décoratif : le système n'anime pas ; le texte suffit.
- Une opération longue annonce son avancement en valeur (« 42 / 120 ») et peut être annulée.

### 5.6 Erreur

- **Erreur de champ** : au champ (3.6). **Erreur de page ou de chargement** : message dans la zone concernée avec la cause, l'action de reprise (« Réessayer ») et l'identifiant technique en mono. **Erreur d'action** : toast `danger` qui reste jusqu'à fermeture.
- Un message d'erreur dit **ce qui s'est passé**, **pourquoi** si on le sait, et **ce qu'on peut faire** (section 6).
- Page introuvable : eyebrow « Erreur 404 », titre de la condition, lien de retour. Session expirée : redirection vers la connexion puis retour à la page.
- Un conflit de version dit quelles valeurs ont changé et recharge la fiche.

### 5.7 Confirmation destructive

- Une suppression irréversible passe par une modale (3.11) dont le titre nomme l'objet et dont le corps dit la conséquence chiffrée (« Le dossier DOS-001 contient 18 éléments liés. Sa suppression est irréversible. »).
- Le bouton de confirmation reprend le verbe (« SUPPRIMER ») en `{component.button.danger}` ; le bouton par défaut au focus est l'annulation.
- Pour un objet qui porte beaucoup de données, demander de saisir son identifiant avant d'activer le bouton.
- Une action réversible (retrait d'une pièce jointe récupérable) ne demande pas de confirmation : elle s'annule par un toast avec action « Annuler ».

## 6. Contenu

### 6.1 Ton

Factuel, direct, sans emphase. Pas de « Désolé », « Oups », « Bravo », pas de point d'exclamation, pas de suggestion amicale. On écrit « Dossier introuvable. Vérifiez la clé. » et non « Désolé, ce dossier n'existe pas. ». Un message ne s'excuse pas et ne félicite pas : il informe.

### 6.2 Libellés

- Boutons : verbe à l'infinitif + objet quand c'est utile (« EXPORTER », « NOUVEL ÉLÉMENT »), en capitales via le style, pas dans le texte source.
- Un terme = un concept, partout ; on emploie le vocabulaire du métier avant celui de l'outil.
- Titres : nom ou groupe nominal court. Étiquettes : nom, pas de verbe, pas de deux-points final.
- Pas d'abréviation que l'utilisateur ne connaît pas ; l'identifiant technique est en mono à côté du libellé, pas à sa place.

### 6.3 Messages d'erreur

Structure : **fait** (ce qui n'a pas marché), **cause** si elle est connue, **action** possible. Exemples : « Version attendue 2, version courante 3. Rechargez la fiche et refaites la modification. » ; « Le fichier dépasse 25 Mo. Réduisez-le ou découpez-le. ». Ne pas montrer de trace technique à l'utilisateur ; la référence de l'erreur est en mono, copiable.

### 6.4 Unités, dates, nombres

| Élément | Format |
|---|---|
| Date | ISO `2026-11-01` dans les tableaux et les identifiants ; en prose, `1er novembre 2026` |
| Date et heure | `2026-11-01 14:32` en mono, fuseau précisé si l'outil sert plusieurs sites |
| Durée | `2 h 30`, `45 s` ; jamais `2.5h` |
| Nombre | séparateur de milliers par espace insécable (`12 487`), virgule décimale en français ; les nombres de colonne en mono tabulaire |
| Pourcentage | `85 %` (espace insécable avant le signe) |
| Unité | toujours après un espace insécable, symbole SI (`25 Mo`, `120 ms`) ; octets en `o`, `Ko`, `Mo`, `Go` en français |
| Identifiants | mono, jamais traduits (`BUG-142`) |
| Valeur vide | `—` ; zéro n'est pas vide |

### 6.5 Langues

Le français est la langue de référence ; l'anglais est tenu à jour en parallèle. Les mêmes règles de ton s'appliquent. Le choix de langue est une action globale dans le pied de la barre latérale, sous forme d'icône à drapeau.


## 7. Audit d'interface

Méthode reproductible qu'une personne ou un agent applique à une **capture**, une **URL** ou du **code**. Le modèle de rapport est dans `AUDIT_TEMPLATE.md` ; les critères, échelles, gravités et efforts sont aussi dans `DESIGN.json` (`audit`).

### 7.A Périmètre et contexte

Avant toute évaluation, renseigner (et écrire dans le rapport) :

1. **Utilisateur type** : rôle, expertise, vocabulaire.
2. **Tâches principales** : 3 à 5, formulées comme des actions (« retrouver un ticket par sa clé », « changer le statut de dix tickets »).
3. **Fréquence d'usage** : quotidien, hebdomadaire, occasionnel ; une tâche quotidienne pèse plus lourd.
4. **Environnement** : taille d'écran et résolution, clavier ou souris, thème, langue, rôles et données de test.
5. **Matériau audité** : capture (nom du fichier), URL et version, ou chemin du code ; écrans, états et rôles couverts.
6. **Contraintes** : délai, données sensibles, parties inaccessibles.

### 7.B Grille d'évaluation

Chaque critère reçoit une note de **0 à 3** et une **preuve obligatoire** (zone de l'écran, sélecteur CSS, ligne de code ou nom de capture). Pas de preuve, pas de note : `NV` (non vérifié) avec la raison.

| Note | Signification |
|---|---|
| 0 | Absent ou contraire au critère. |
| 1 | Partiel : écarts fréquents, ou défaut sur une tâche principale. |
| 2 | Conforme avec des écarts mineurs isolés. |
| 3 | Conforme, aucun écart observé. |
| NV | Non vérifié (état non visible, flux non testé) : à justifier, exclu du score. |

| ID | Critère | À regarder |
|---|---|---|
| N1 | Visibilité de l'état du système | Où suis-je, qu'est-ce qui est sélectionné, que se passe-t-il ? Retour après chaque action, état de chargement, page courante. |
| N2 | Correspondance avec le monde réel | Vocabulaire du métier, unités, ordre des informations. |
| N3 | Contrôle et liberté | Annuler, revenir, quitter une modale, défaire. |
| N4 | Cohérence et standards | Mêmes mots, mêmes composants, mêmes positions pour les mêmes actions. |
| N5 | Prévention des erreurs | Contraintes de saisie, valeurs par défaut sûres, confirmations utiles. |
| N6 | Reconnaissance plutôt que rappel | Options visibles, étiquettes toujours présentes, aide contextuelle. |
| N7 | Flexibilité et efficacité | Raccourcis, filtres enregistrés, actions groupées, parcours expert. |
| N8 | Design esthétique et minimaliste | Rien d'ornemental ; chaque élément sert une tâche. |
| N9 | Aide à la récupération d'erreur | Message : fait, cause, action ; reprise sans perte de saisie. |
| N10 | Aide et documentation | Aide accessible, à la même place, à jour. |
| H1 | Hiérarchie visuelle et lisibilité | Un point d'entrée clair, titres, groupement, contraste de taille, longueur de ligne. |
| T1 | Cohérence avec le système | Tokens, composants et règles non négociables de ce document (principes 1 à 7). |
| A1 | Accessibilité : contrastes | Ratios mesurés sur chaque paire texte/fond, 4,5:1 et 3:1. |
| A2 | Accessibilité : clavier et ordre de focus | Parcours complet sans souris, ordre logique, pas de piège. |
| A3 | Accessibilité : focus visible | Focus ring présent, ≥ 3:1, non masqué. |
| A4 | Accessibilité : libellés, noms et rôles | Étiquettes associées, `aria-label`, titres, régions. |
| A5 | Accessibilité : zones cliquables et couleur seule | 24 px minimum ; aucun état porté par la couleur seule. |
| D1 | Densité et charge cognitive | Quantité d'information par écran, regroupements, éléments inutiles. |
| P1 | Performance perçue et retours d'action | Délai avant retour, indicateurs, optimisme, annulation. |
| R1 | Responsive et robustesse | Contenus longs, vides, en erreur ; 320 px, 768 px, 1440 px ; texte à 200 %. |

**Procédure.**

1. Faire l'inventaire des écrans et des états (nominal, vide, erreur, chargement, contenu long, rôle restreint).
2. Pour chaque tâche principale, la dérouler de bout en bout et noter les écarts.
3. Pour **T1** et **A1**, mesurer plutôt qu'estimer : lire les couleurs et polices effectives (outil de développement ou code), les comparer aux tokens de `DESIGN.json`, calculer les contrastes (`scripts/validate-design.mjs --contrast "#fg" "#bg"`).
4. Noter les critères, puis rédiger les constats.

### 7.C Format de rapport imposé

Chaque constat porte les champs suivants (le gabarit est dans `AUDIT_TEMPLATE.md`) :

| Champ | Contenu |
|---|---|
| Identifiant et titre | `F-01`, titre court de moins de 10 mots. |
| Gravité | **bloquant** (empêche une tâche principale ou exclut un public), **majeur** (dégrade nettement l'usage ou viole un critère AA), **mineur** (gêne ponctuelle ou écart de cohérence), **suggestion** (amélioration facultative). |
| Critère violé | Identifiant de la grille (N1…R1). |
| Preuve | Emplacement précis : zone de l'écran, sélecteur, ligne de code ou capture. |
| Nature | **fait observé**, **interprétation** ou **recommandation**. Un constat commence par un fait. |
| Impact utilisateur | Qui est gêné, sur quelle tâche, avec quelle conséquence. |
| Correction recommandée | Exprimée en tokens du système (`{semantic.text.mute-aa}` au lieu de « un gris plus foncé »). |
| Effort | **S** (moins d'une demi-journée), **M** (1 à 3 jours), **L** (plus de 3 jours). |
| Vérifié | Oui / non, et comment ; ce qui n'a pas pu l'être. |

### 7.D Synthèse

Le rapport se termine par :

1. **Score par critère** (0 à 3, `NV` exclu), avec la moyenne par famille (Nielsen, hiérarchie, système, accessibilité, densité, performance, robustesse).
2. **Top 5 des problèmes** : tri par gravité puis par impact sur les tâches fréquentes.
3. **Gains rapides** : gravité bloquant ou majeur et effort **S**.
4. **Plan de correction priorisé** : ordre, dépendances, effort cumulé ; les corrections de tokens d'abord (elles se propagent).
5. **Périmètre non vérifié** : liste explicite des états, rôles et flux non testés.

### 7.E Règles de rigueur

- **Ne jamais affirmer sans preuve.** Une phrase sans emplacement ni mesure n'est pas un constat.
- **Distinguer** le fait observé (« le texte `.ath-eyebrow` mesure 4,16:1 sur `#F0F7FC` »), l'interprétation (« les utilisateurs risquent de manquer l'étiquette ») et la recommandation.
- **Signaler ce qui n'a pas pu être vérifié** : état non atteignable, rôle non disponible, flux non testé, matériau en basse définition.
- **Ne pas proposer de re-design avant la fin de l'audit** : l'audit produit des constats et des corrections ciblées ; la refonte relève de la §8 et se base sur lui.
- Ne pas noter ce qu'on n'a pas vu ; ne pas arrondir en faveur de l'interface auditée.
- Reproductibilité : deux personnes qui suivent la procédure sur le même matériau doivent trouver les mêmes constats bloquants et majeurs. Si un constat dépend du goût, c'est une suggestion.


## 8. Méthode de re-design

Elle commence **après** un audit terminé.

1. **Partir des constats.** Chaque changement proposé cite l'identifiant du constat qu'il corrige (`F-03`). Une idée qui ne corrige aucun constat est une suggestion, signalée comme telle.
2. **Réutiliser avant de créer.** On emploie d'abord les composants (§3), les patterns (§5) et les tokens existants. Un nouveau composant ou token n'apparaît que s'il est justifié par un constat, et il est ajouté à `DESIGN.json` avec `"status": "proposed"` avant tout usage.
3. **Proposer court, puis livrer.** Première livraison : une proposition d'une page (principes retenus, changements majeurs, compromis, constats couverts). La maquette ou le code n'est produit qu'**après validation**.
4. **Avant / après.** Chaque proposition montre l'état actuel, l'état cible et la liste des tokens employés (`{...}`), avec le gain attendu (contraste, nombre d'étapes, densité).
5. **Vérifier en sortie.**
   - contrastes **recalculés** pour chaque nouvelle paire (`scripts/validate-design.mjs --contrast`) ;
   - **ordre de focus** parcouru à la main ;
   - états **vide, erreur, chargement** et rôle restreint ;
   - **contenu long** (libellés de 60 caractères, 1 000 lignes, noms sans espace) ;
   - respect des règles non négociables (§1) et du lint de design.
6. **Mettre à jour la source.** Si la refonte révèle un manque du système, le consigner dans le journal (§9) et dans `DESIGN.json`, pas seulement dans l'écran.

Modèle de proposition :

| Rubrique | Contenu |
|---|---|
| Constats couverts | `F-01`, `F-04` |
| Principes en jeu | 5, 6 |
| Changement | Description en deux phrases. |
| Avant / après | Capture ou extrait de code des deux états. |
| Tokens | `{semantic.text.mute-aa}`, `{component.field}` |
| Compromis | Ce que l'on perd (place, densité, cohérence avec l'existant). |
| Effort | S / M / L |
| Décision | À valider : oui / non |


## 9. Journal des décisions

| ID | Date | Décision | Raison | Alternative écartée |
|---|---|---|---|---|
| D-001 | 2026-11-01 | Source de vérité : ce dépôt (`packages/ui/design`). Le dossier est autonome. | Une seule source évite toute dérive ; Athena doit pouvoir vivre sans dépôt externe. | Maintenir une copie synchronisée depuis un autre dépôt. |
| D-002 | 2026-11-01 | Les clés `colors`, `typography`, `rounded`, `spacing` du front matter sont inchangées ; tous les nouveaux tokens vivent dans `DESIGN.json` sous `tokens`. | `build-tokens.mjs` génère le CSS d'Athena depuis ces quatre blocs ; `lint-design.mjs` lit tous les `#` du `.md` comme palette autorisée. | Ajouter les nouvelles couleurs au front matter (cela élargirait en silence la palette du lint). |
| D-003 | 2026-11-01 | Aucune valeur primitive existante n'est modifiée pour corriger les contrastes ; des variantes `-aa` / `-text` sont créées (voir D-013 pour leur adoption par défaut). | Ne pas changer l'identité sans validation ; Athena applique déjà ces assombrissements dans son CSS. | Assombrir `mute-ink` et les signaux directement. |
| D-004 | 2026-11-01 | Le thème sombre n'emploie que des valeurs des rampes tonales de `colorMeta`. | Ne rien inventer sur l'identité visuelle. | Inventer une palette sombre. |
| D-005 | 2026-11-01 | Le CSS d'exemple du JSON utilise `#FCFDFE` là où le `.md` dit Instrument White (au lieu de `#FFFFFF`). | Aligner exemples et tokens. | Laisser coexister deux blancs. |
| D-006 | 2026-11-01 | Modale et toast passent de `proposed` à `stable`. | Implémentés et testés dans Athena (`Modal`, `ToastProvider`). | Les laisser `proposed`. |
| D-007 | 2026-11-01 | Un token se cite `{colors.ink}` ; la section « Registre des tokens » est générée par le script et vérifiée à chaque exécution. | Rendre la synchronisation `.md` / `.json` contrôlable par machine. | Un contrôle manuel ; des identifiants libres en prose. |
| D-008 | 2026-11-01 | Les valeurs observées dans Athena sans token (`9.5px`, `rgba(...)`, 28 px, etc.) sont intégrées au JSON : `proposed` si l'écart est à discuter, `deprecated` pour `fontSizes.micro`. | Faire du JSON le miroir du réel, sans le légitimer par défaut. | Les ignorer ; les déclarer `stable`. |
| D-009 | 2026-11-01 | Le script de validation est du Node sans dépendance, avec un lecteur YAML minimal limité au front matter. | Utilisable sans installation, dans tout projet Node. | Dépendance `yaml`. |
| D-010 | 2026-11-01 | Le vocabulaire propre au produit d’origine (nom du produit, termes métier liés à ses données, références de pièces) est retiré ; la charte s’appelle « Hemeria Design System » et ses exemples sont génériques (dossier, élément, REF-0001). | La charte doit servir à tout outil Hemeria, pas à un seul produit. | Garder le nom d’origine et y ajouter Athena. |
| D-011 | 2026-11-01 | Le script vérifie aussi les CSS consommateurs (--check-css) et la copie synchronisée (--same-as). | Supprimer le risque d’une dérive silencieuse entre la charte et le CSS consommateur, ou entre deux copies de la charte. | Se fier à la relecture. |
| D-012 | 2026-11-01 | lint-design.mjs d’Athena tire sa palette des seules couleurs du front matter, plus de tous les « # » du .md. | Écrire une couleur dans un exemple ne doit pas l’autoriser. | Surveiller la prose à la main. |
| D-013 | 2026-11-01 | Les variantes accessibles deviennent les valeurs sémantiques par défaut : `{semantic.text.mute}` (`{colors.mute-ink-aa}`), `{semantic.text.link}` (`{colors.console-sky-text}`), `{semantic.state.success.fg}` et équivalents. Les couleurs primitives ne changent pas. | Supprimer les écarts de contraste du thème clair sans toucher à la palette ; Athena applique déjà ces assombrissements. | Laisser les écarts en `known-issue`. |
| D-014 | 2026-11-01 | Le contour d'un champ utilise `{semantic.border.control}` (3:1) ; `{semantic.border.default}` est réservé aux filets décoratifs ; le focus ring sur surface inverse utilise `{semantic.focus.ring-on-inverse}` ; l'en-tête de tableau passe à 11 px. | WCAG 1.4.11 et plancher de 11 px ; toutes les paires par défaut atteignent leur seuil. | Exempter le contour des champs comme séparateur décoratif. |
| D-015 | 2026-11-01 | Corrections de l’audit Athena : confirmation des suppressions irréversibles, toasts d’erreur persistants, lien d’évitement, entrée d’aide, état loading des boutons, tailles 11 px minimum, troncature des titres, volet de navigation sous 768 px, suggestion des valeurs ATQL, page Administration réservée. Nouveaux tokens de composant en proposed : skip-link, confirm-dialog, help-entry, table.row.clip. | Chaque changement corrige un constat F-01 à F-13 de design-audit-work/AUDIT_athena.md ; aucun token existant n’est supprimé. | Laisser les écarts en known-issue ; créer des composants sans les déclarer. |
| D-016 | 2026-11-02 | Disposition de la vue détails d'un tracker : sections titrées, grille de 3 colonnes, largeur 1 à 3 par attribut, éditeur WYSIWYG avec glisser-déposer et boutons équivalents, disposition automatique par défaut. Nouveaux tokens de composant en proposed : layout-grid, layout-editor. | Demande produit : maîtriser la disposition des attributs à la création d'un tracker ; la disposition automatique évite d'imposer la configuration. | Configuration par liste d'ordre seule (pas de largeur) ; glisser-déposer sans alternative au clavier. |
| D-017 | 2026-11-02 | Passent de proposed à stable les tokens que l'interface d'Athena utilise : primitive.zIndex.sticky, primitive.zIndex.toast, primitive.sizes.sidebar, states.loading, component.skip-link, component.confirm-dialog, component.help-entry, component.layout-grid, component.layout-editor. Les autres tokens proposed (thème sombre, densités, surcouches) restent en attente. | Ces tokens sont livrés, testés (unitaires et e2e) et audités ; les laisser proposed faussait l'état de la charte. | Tout passer en stable, y compris le thème sombre qu'aucune feuille de style ne consomme. |

### Décisions en attente (`proposed`)

Ces tokens sont déjà appliqués par défaut (D-013, D-014) pour supprimer les écarts de contraste ; ils restent `proposed` jusqu'à validation et peuvent être annulés en repointant la couche sémantique.

1. **Thème sombre** complet (`semantic.themes.dark`).
2. **Variantes accessibles** : `{colors.mute-ink-aa}`, `{colors.signal-success-text}`, `{colors.signal-warning-text}`, `{colors.signal-danger-text}`, `{colors.console-sky-text}`, adoptées par `{semantic.text.mute}`, `{semantic.text.link}` et `{semantic.state.success.fg}`.
3. **Contour de champ** `{semantic.border.control}` (3:1), adopté par `{component.field}`.
4. **Focus ring** unique `{semantic.focus.ring}` et `{semantic.focus.ring-on-inverse}`, qui remplacent les trois variantes observées.
5. **Échelle d'espacement étendue** (`2xs`, `base`, `2xl`, `3xl`) et **breakpoints** `sm`, `lg`, `xl`.
6. **Densités** `compact` et `comfortable`.
7. **États** `active` et `loading`, durée `instant` (mouvement réduit), `zIndex.sticky` et `zIndex.toast`.
8. **Dépréciation de `{fontSizes.micro}`** (9,5 px) au profit de `{fontSizes.xs}` pour les en-têtes de tableau.

## 10. Outillage

### 10.1 `scripts/validate-design.mjs`

Script Node sans dépendance. Depuis la racine du dépôt :

```
node scripts/validate-design.mjs            # contrôle
node scripts/validate-design.mjs --write    # régénère le registre des tokens du .md
node scripts/validate-design.mjs --contrast "#006EB1" "#FCFDFE"   # ratio de deux couleurs
node scripts/validate-design.mjs --check-css src/styles.css   # couleurs d'un CSS consommateur
node scripts/validate-design.mjs --same-as <dossier>          # copie identique d'une autre charte (facultatif)
```

Il vérifie, et sort en erreur (code 1) si :

1. `DESIGN.json` est un JSON valide et `DESIGN.md` a un front matter lisible ;
2. chaque token cité `{chemin}` dans le `.md` existe dans le front matter ou dans le JSON ;
3. chaque token du JSON non déprécié est présent dans le registre du `.md`, et le registre est à jour ;
4. les couleurs primitives du JSON sont égales à celles du front matter ;
5. chaque paire de `contrast.pairs` a le ratio affiché (à 0,01 près), et toute paire sous son seuil porte `result: "known-issue"` avec une `remediation` ou une `accepted` ; chaque `remediation` citée existe ;
6. aucune couleur du `.md` n'est hors palette (même règle que `lint-design.mjs`) ;
7. chaque couleur hexadécimale des CSS passés avec `--check-css` appartient à la palette ;
8. avec `--same-as`, `DESIGN.md`, `DESIGN.json` et `AUDIT_TEMPLATE.md` sont identiques à ceux de l'autre dépôt ;
9. chaque décision du JSON figure dans le journal.

### 10.2 `AUDIT_TEMPLATE.md`

Gabarit de rapport d'audit : contexte, grille notée, constats au format imposé (§7.C), synthèse (§7.D). Copier le fichier, le renseigner, ne pas laisser de champ vide : écrire `NV` avec la raison.

### 10.3 Consommateurs

`packages/ui/scripts/build-tokens.mjs` lit quatre blocs du front matter de `DESIGN.md` (couleurs, espacement, arrondis, typographie) et `lint-design.mjs` en tire sa palette. Après une modification : exécuter `pnpm --filter @athena/ui build` puis `pnpm check` (qui inclut `design:check`).

## 11. Registre des tokens

Généré par `scripts/validate-design.mjs --write`. Ne pas modifier à la main.

<!-- registry:start -->
#### colors

| Token | Valeur | Statut |
|---|---|---|
| `{colors.cold-mist}` | #F0F7FC | stable |
| `{colors.console-border}` | #C2DDF0 | stable |
| `{colors.console-sky}` | #006EB1 | stable |
| `{colors.console-sky-text}` | #005E96 | proposed |
| `{colors.dim-ink}` | #43474C | stable |
| `{colors.hover-mist}` | #E6F3FA | stable |
| `{colors.ink}` | #001423 | stable |
| `{colors.instrument-white}` | #FCFDFE | stable |
| `{colors.mute-ink}` | #73777D | stable |
| `{colors.mute-ink-aa}` | #505358 | proposed |
| `{colors.muted-mist}` | #DBE7F0 | stable |
| `{colors.pill-danger-bg}` | #FBE9E9 | stable |
| `{colors.pill-success-bg}` | #EAF6EE | stable |
| `{colors.pill-warning-bg}` | #FBF3DC | stable |
| `{colors.selection-veil}` | #CEE5FC | stable |
| `{colors.signal-danger}` | #BA1A1A | stable |
| `{colors.signal-danger-text}` | #9E1616 | proposed |
| `{colors.signal-success}` | #1F8A4C | stable |
| `{colors.signal-success-text}` | #166337 | proposed |
| `{colors.signal-warning}` | #C68A00 | stable |
| `{colors.signal-warning-text}` | #6D4C00 | proposed |
| `{colors.sovereign-deep-blue}` | #12293A | stable |
| `{colors.tricolor-blue}` | #174082 | stable |
| `{colors.tricolor-red}` | #C80A26 | stable |

#### overlays

| Token | Valeur | Statut |
|---|---|---|
| `{overlays.on-inverse-border}` | rgba(255, 255, 255, 0.35) | proposed |
| `{overlays.on-inverse-hover}` | rgba(255, 255, 255, 0.12) | proposed |
| `{overlays.on-inverse-subtle}` | rgba(255, 255, 255, 0.06) | proposed |
| `{overlays.scrim}` | rgba(0, 20, 35, 0.55) | stable |
| `{overlays.sky-tint-active}` | rgba(0, 110, 177, 0.18) | proposed |

#### fontSizes

| Token | Valeur | Statut |
|---|---|---|
| `{fontSizes.2xl}` | 26px | stable |
| `{fontSizes.2xs}` | 10px | stable |
| `{fontSizes.3xl}` | 32px | stable |
| `{fontSizes.lg}` | 15px | stable |
| `{fontSizes.md}` | 13px | stable |
| `{fontSizes.micro}` | 9.5px | deprecated |
| `{fontSizes.sm}` | 12px | stable |
| `{fontSizes.stat}` | 30px | stable |
| `{fontSizes.xl}` | 18px | stable |
| `{fontSizes.xs}` | 11px | stable |

#### fontFamilies

| Token | Valeur | Statut |
|---|---|---|
| `{fontFamilies.mono}` | IBM Plex Mono, ui-monospace, monospace | stable |
| `{fontFamilies.sans}` | IBM Plex Sans, system-ui, sans-serif | stable |

#### fontWeights

| Token | Valeur | Statut |
|---|---|---|
| `{fontWeights.bold}` | 700 | stable |
| `{fontWeights.medium}` | 500 | stable |
| `{fontWeights.regular}` | 400 | stable |
| `{fontWeights.semibold}` | 600 | stable |

#### letterSpacings

| Token | Valeur | Statut |
|---|---|---|
| `{letterSpacings.eyebrow}` | 0.18em | stable |
| `{letterSpacings.heading}` | 0.04em | stable |
| `{letterSpacings.heading-sm}` | 0.02em | stable |
| `{letterSpacings.label}` | 0.12em | stable |
| `{letterSpacings.none}` | 0 | stable |
| `{letterSpacings.pill}` | 0.14em | stable |
| `{letterSpacings.tag}` | 0.10em | stable |

#### lineHeights

| Token | Valeur | Statut |
|---|---|---|
| `{lineHeights.body}` | 1.45 | stable |
| `{lineHeights.tight}` | 1.15 | stable |

#### spacing

| Token | Valeur | Statut |
|---|---|---|
| `{spacing.2xl}` | 32px | proposed |
| `{spacing.2xs}` | 2px | proposed |
| `{spacing.3xl}` | 48px | proposed |
| `{spacing.base}` | 16px | proposed |
| `{spacing.lg}` | 20px | stable |
| `{spacing.md}` | 12px | stable |
| `{spacing.sm}` | 8px | stable |
| `{spacing.xl}` | 24px | stable |
| `{spacing.xs}` | 4px | stable |

#### rounded

| Token | Valeur | Statut |
|---|---|---|
| `{rounded.none}` | 0 | stable |

#### borderWidths

| Token | Valeur | Statut |
|---|---|---|
| `{borderWidths.accent}` | 3px | stable |
| `{borderWidths.hairline}` | 1px | stable |
| `{borderWidths.stripe}` | 4px | stable |
| `{borderWidths.strong}` | 2px | stable |

#### opacities

| Token | Valeur | Statut |
|---|---|---|
| `{opacities.disabled}` | 0.55 | stable |
| `{opacities.nav-inactive}` | 0.7 | stable |
| `{opacities.sidebar-subtitle}` | 0.45 | stable |

#### durations

| Token | Valeur | Statut |
|---|---|---|
| `{durations.fast}` | 120ms | stable |
| `{durations.instant}` | 0ms | proposed |
| `{durations.toast}` | 5000ms | stable |

#### easings

| Token | Valeur | Statut |
|---|---|---|
| `{easings.linear}` | linear | stable |

#### zIndex

| Token | Valeur | Statut |
|---|---|---|
| `{zIndex.base}` | 0 | proposed |
| `{zIndex.overlay}` | 1000 | stable |
| `{zIndex.sticky}` | 100 | stable |
| `{zIndex.toast}` | 1100 | stable |

#### sizes

| Token | Valeur | Statut |
|---|---|---|
| `{sizes.control-lg}` | 40px | stable |
| `{sizes.control-md}` | 32px | stable |
| `{sizes.control-sm}` | 26px | stable |
| `{sizes.dialog-lg}` | 880px | stable |
| `{sizes.dialog-md}` | 640px | stable |
| `{sizes.dialog-sm}` | 480px | stable |
| `{sizes.icon-button}` | 28px | stable |
| `{sizes.icon-button-compact}` | 24px | stable |
| `{sizes.prose-max}` | 75ch | stable |
| `{sizes.sidebar}` | 232px | stable |
| `{sizes.sidebar-collapsed}` | 64px | stable |
| `{sizes.tag-height}` | 18px | stable |
| `{sizes.toast-max}` | 420px | stable |
| `{sizes.toast-min}` | 280px | stable |
| `{sizes.touch-target-min}` | 24px | proposed |

#### breakpoints

| Token | Valeur | Statut |
|---|---|---|
| `{breakpoints.lg}` | 1024px | proposed |
| `{breakpoints.md}` | 768px | stable |
| `{breakpoints.sm}` | 480px | proposed |
| `{breakpoints.xl}` | 1440px | proposed |

#### semantic

| Token | Valeur | Statut |
|---|---|---|
| `{semantic.action.danger.bg}` | transparent | stable |
| `{semantic.action.danger.border}` | {colors.signal-danger} | stable |
| `{semantic.action.danger.fg}` | {colors.signal-danger} | stable |
| `{semantic.action.deep.bg}` | {colors.sovereign-deep-blue} | stable |
| `{semantic.action.deep.fg}` | {colors.instrument-white} | stable |
| `{semantic.action.ghost.bg}` | transparent | stable |
| `{semantic.action.ghost.border}` | {colors.sovereign-deep-blue} | stable |
| `{semantic.action.ghost.fg}` | {colors.sovereign-deep-blue} | stable |
| `{semantic.action.primary.bg}` | {colors.console-sky} | stable |
| `{semantic.action.primary.fg}` | {colors.instrument-white} | stable |
| `{semantic.border.control}` | {colors.mute-ink} | proposed |
| `{semantic.border.danger}` | {colors.signal-danger} | stable |
| `{semantic.border.default}` | {colors.console-border} | stable |
| `{semantic.border.focus}` | {colors.console-sky} | stable |
| `{semantic.border.strong}` | {colors.sovereign-deep-blue} | stable |
| `{semantic.focus.ring}` | {colors.console-sky} | proposed |
| `{semantic.focus.ring-on-inverse}` | {colors.instrument-white} | proposed |
| `{semantic.state.danger.bg}` | {colors.pill-danger-bg} | stable |
| `{semantic.state.danger.border}` | {colors.signal-danger} | stable |
| `{semantic.state.danger.fg}` | {colors.signal-danger-text} | proposed |
| `{semantic.state.danger.fg-aa}` | {colors.signal-danger-text} | proposed |
| `{semantic.state.info.bg}` | {colors.hover-mist} | stable |
| `{semantic.state.info.border}` | {colors.console-sky} | stable |
| `{semantic.state.info.fg}` | {colors.console-sky-text} | proposed |
| `{semantic.state.info.fg-aa}` | {colors.console-sky-text} | proposed |
| `{semantic.state.neutral.bg}` | {colors.instrument-white} | proposed |
| `{semantic.state.neutral.border}` | {colors.sovereign-deep-blue} | proposed |
| `{semantic.state.neutral.fg}` | {colors.dim-ink} | proposed |
| `{semantic.state.neutral.fg-aa}` | {colors.dim-ink} | proposed |
| `{semantic.state.success.bg}` | {colors.pill-success-bg} | stable |
| `{semantic.state.success.border}` | {colors.signal-success} | stable |
| `{semantic.state.success.fg}` | {colors.signal-success-text} | proposed |
| `{semantic.state.success.fg-aa}` | {colors.signal-success-text} | proposed |
| `{semantic.state.warning.bg}` | {colors.pill-warning-bg} | stable |
| `{semantic.state.warning.border}` | {colors.signal-warning} | stable |
| `{semantic.state.warning.fg}` | {colors.signal-warning-text} | proposed |
| `{semantic.state.warning.fg-aa}` | {colors.signal-warning-text} | proposed |
| `{semantic.surface.app}` | {colors.cold-mist} | stable |
| `{semantic.surface.default}` | {colors.instrument-white} | stable |
| `{semantic.surface.hover}` | {colors.hover-mist} | stable |
| `{semantic.surface.inverse}` | {colors.sovereign-deep-blue} | stable |
| `{semantic.surface.muted}` | {colors.muted-mist} | stable |
| `{semantic.surface.scrim}` | {overlays.scrim} | stable |
| `{semantic.surface.selected}` | {colors.selection-veil} | stable |
| `{semantic.text.default}` | {colors.ink} | stable |
| `{semantic.text.heading}` | {colors.sovereign-deep-blue} | stable |
| `{semantic.text.link}` | {colors.console-sky-text} | proposed |
| `{semantic.text.link-aa}` | {colors.console-sky-text} | proposed |
| `{semantic.text.mute}` | {colors.mute-ink-aa} | proposed |
| `{semantic.text.mute-aa}` | {colors.mute-ink-aa} | proposed |
| `{semantic.text.on-action}` | {colors.instrument-white} | stable |
| `{semantic.text.on-inverse}` | {colors.instrument-white} | stable |
| `{semantic.text.secondary}` | {colors.dim-ink} | stable |

#### states

| Token | Valeur | Statut |
|---|---|---|
| `{states.active}` | — | proposed |
| `{states.default}` | — | stable |
| `{states.disabled}` | — | stable |
| `{states.error}` | — | stable |
| `{states.focus}` | — | stable |
| `{states.hover}` | — | stable |
| `{states.loading}` | — | stable |
| `{states.selected}` | — | stable |

#### density

| Token | Valeur | Statut |
|---|---|---|
| `{density.comfortable}` | {sizes.control-lg} | proposed |
| `{density.compact}` | {sizes.control-sm} | proposed |
| `{density.normal}` | {sizes.control-md} | stable |

#### component

| Token | Valeur | Statut |
|---|---|---|
| `{component.badge.chip}` | — | stable |
| `{component.badge.pill}` | — | stable |
| `{component.badge.tag}` | — | stable |
| `{component.button.danger}` | — | stable |
| `{component.button.deep}` | — | stable |
| `{component.button.ghost}` | — | stable |
| `{component.button.primary}` | — | stable |
| `{component.card}` | — | stable |
| `{component.confirm-dialog}` | — | stable |
| `{component.empty-state}` | — | stable |
| `{component.field}` | — | stable |
| `{component.help-entry}` | — | stable |
| `{component.layout-editor}` | — | stable |
| `{component.layout-grid}` | — | stable |
| `{component.modal}` | — | stable |
| `{component.nav-item}` | — | stable |
| `{component.page-header}` | — | stable |
| `{component.skip-link}` | — | stable |
| `{component.stat-card}` | — | stable |
| `{component.tab}` | — | stable |
| `{component.table.cell-mono}` | — | stable |
| `{component.table.header}` | — | stable |
| `{component.table.row}` | — | stable |
| `{component.table.row.clip}` | — | proposed |
| `{component.toast}` | — | stable |

<!-- registry:end -->
