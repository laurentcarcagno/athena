# Rapport d'audit d'interface : Athena

Audit selon `DESIGN.md` / `DESIGN.json` (Hemeria Design System 3.0.0, `packages/ui/design/`, validés en mode strict : 559 chemins de tokens, 64 paires de contraste, 0 écart). Les preuves sont dans `design-audit-work/evidence/` (captures, `results.json`) ; les scripts de mesure sont `collect.mjs` et `collect2.mjs`.

## 1. Périmètre et contexte

| Rubrique | Contenu |
|---|---|
| Interface auditée | Athena (application web), http://localhost:3000, code `apps/web/src` et `packages/ui`, état du dépôt au 2026-11-01 |
| Matériau | Application en cours d'exécution pilotée par Chromium (Playwright) avec le compte `admin.dev` ; captures pleine page dans `evidence/*.png` ; mesures dans `evidence/results.json` ; lecture du code pour les comportements |
| Écrans et états couverts | 11 écrans : Projets, Recherche, Fiche artefact, Board, Tableau de bord, Mon travail, Gestion de projet, Organisation, Configuration de tracker, Création de tracker, Administration. États : nominal (11), vide de recherche (`liste-vide.png`), contenu long simulé, largeurs 375 / 720 / 768 / 1024 / 1440 px |
| Utilisateur type | Ingénieur ou chef de projet qui suit des tickets plusieurs heures par jour |
| Tâches principales | 1. retrouver un artefact ; 2. traiter un artefact (champ, transition) ; 3. suivre l'avancement (board, tableau de bord) ; 4. configurer un tracker ou un projet (administrateur) |
| Fréquence d'usage | Quotidienne pour 1 à 3, occasionnelle pour 4 |
| Environnement | 1440 × 900, clavier et souris, thème clair, français |
| Contraintes | Onglet Développement (aucun dépôt GitLab lié), plugins (aucun installé), thème sombre (non implémenté), rôles `athena-user` et `athena-pm` (seul `admin.dev` a été utilisé pour les mesures) : NV |
| Version de DESIGN.md / DESIGN.json | 3.0.0 |

## 2. Grille d'évaluation

Notes de 0 à 3. NV = non vérifié. Les notes portent sur les écrans de `admin.dev` ; les écrans de `user.dev` et `pm.dev` ont été audités ensuite (§4.5).

| ID | Critère | Note | Preuve | Constats liés |
|---|---|---|---|---|
| N1 | Visibilité de l'état du système | 2 | Pastilles de statut, `aria-current`, toasts (`components.tsx` ToastView) ; pas d'état de chargement sur les boutons | F-08 |
| N2 | Correspondance avec le monde réel | 2 | Libellés en français ; l'ATQL exige les clés techniques (`in_progress`) alors que l'interface affiche « En cours » | F-10 |
| N3 | Contrôle et liberté | 2 | Annulation dans les modales, `Échap`, restauration de révision (`fiche.png`, onglet Historique) | F-01 |
| N4 | Cohérence et standards | 2 | Mêmes composants partout ; `window.confirm` natif à la place de la modale (`TrackerConfigPage.tsx:53`) | F-03 |
| N5 | Prévention des erreurs | 1 | Trois suppressions irréversibles sans confirmation (`OrgAdminPage.tsx:129, 197, 258`) | F-01 |
| N6 | Reconnaissance plutôt que rappel | 2 | Étiquettes toujours visibles ; suggestions de champs et de mots-clés mais pas de valeurs (`ListPage.tsx`, `suggest()`) | F-10 |
| N7 | Flexibilité et efficacité | 2 | Palette `Ctrl+K`, filtres enregistrés, tri ; le raccourci n'est plus indiqué dans l'interface | F-11 |
| N8 | Design esthétique et minimaliste | 3 | 0 arrondi, 0 ombre, 0 dégradé sur 11 écrans (`results.json`, champs `radius`, `shadow`, `gradient`) | |
| N9 | Aide à la récupération d'erreur | 1 | Les toasts d'erreur disparaissent après 5 s (`components.tsx:215-219`) | F-02 |
| N10 | Aide et documentation | 1 | Aucune entrée d'aide dans la barre latérale ni l'en-tête (`evidence/projets.png`) | F-12 |
| H1 | Hiérarchie visuelle et lisibilité | 2 | Un seul `h1` par écran, titres et groupes clairs ; textes de 8 à 10 px | F-05 |
| T1 | Cohérence avec les tokens et composants | 2 | Palette et formes conformes (lint, 0 écart) ; écarts : modale native, 9 px, opacité de sous-titre | F-03, F-05 |
| A1 | Accessibilité : contrastes | 3 | axe-core (WCAG 2.0 à 2.2 AA) : 0 violation sur 11 écrans ; `validate-design --strict` : 64 paires conformes | |
| A2 | Accessibilité : clavier et ordre de focus | 2 | Ordre logique ; 9 arrêts de tabulation dans la barre latérale avant chaque contenu, pas de lien d'évitement | F-04 |
| A3 | Accessibilité : focus visible | 3 | 14 arrêts parcourus sur chacun des 11 écrans : aucun focus invisible (`results.json`, champ `order`) | |
| A4 | Accessibilité : libellés, noms et rôles | 3 | 0 champ sans libellé ; un `main`, un `nav` nommé ; axe : 0 violation | |
| A5 | Accessibilité : zones cliquables et couleur seule | 2 | Liens de clés de 15 à 19 px de haut ; états toujours accompagnés d'un texte | F-06 |
| D1 | Densité et charge cognitive | 3 | Tableaux denses lisibles, tableau de bord asymétrique (`dashboard.png`) | |
| P1 | Performance perçue et retours d'action | 2 | Texte « Chargement… » (`role="status"`) et toasts de succès ; aucun état `loading` des boutons | F-08 |
| R1 | Responsive et contenus longs, vides, en erreur | 1 | Débordement horizontal avec un titre long ; sidebar empilée à 375 px | F-07, F-09 |

## 3. Constats

### F-01 : suppressions irréversibles sans confirmation

| Champ | Contenu |
|---|---|
| Gravité | majeur |
| Critère violé | N5 |
| Nature | fait observé, puis interprétation |
| Preuve | `apps/web/src/pages/OrgAdminPage.tsx:129` (supprimer un template de projet), `:197` (template de tracker), `:258` (désinstaller un plugin) : l'appel `DELETE` part au clic. `DESIGN.md` §5.7 exige une modale nommant l'objet et la conséquence pour une suppression irréversible. |
| Fait observé | Les trois boutons appellent directement l'API, sans modale ni annulation ; seul le retrait d'un champ de tracker passe par une confirmation. |
| Impact utilisateur | Un clic mal placé supprime un template ou désinstalle un plugin (et, selon la politique de données du plugin, ses données). Interprétation : le risque est faible au quotidien mais la perte est sans retour. |
| Correction recommandée | Ouvrir `{component.modal}` avec le titre de l'objet, la conséquence chiffrée et `{component.button.danger}` ; focus initial sur l'annulation (`{states.focus}`). |
| Effort | M (un composant de confirmation réutilisable, trois usages) |
| Vérifié | Code relu ; comportement non exercé (suppression non lancée pour ne pas modifier les données) |

### F-02 : les toasts d'erreur disparaissent après 5 secondes

| Champ | Contenu |
|---|---|
| Gravité | majeur |
| Critère violé | N9 |
| Nature | fait observé |
| Preuve | `packages/ui/src/components.tsx:215-219` : tous les toasts, `danger` compris, sont retirés après `duration` ; la pause n'a lieu qu'au survol (`onMouseEnter`), pas au focus. `DESIGN.md` §5.6 : une erreur d'action reste jusqu'à fermeture ; §4.6 : pause au survol et au focus. |
| Fait observé | Un message d'erreur (par exemple conflit de version) s'efface seul au bout de 5 s. |
| Impact utilisateur | Un utilisateur qui regarde ailleurs perd la cause et l'action de reprise ; un utilisateur du clavier ne peut pas suspendre le délai. |
| Correction recommandée | Ne pas appliquer `{durations.toast}` aux toasts `danger` ; suspendre aussi au `focus`. |
| Effort | S |
| Vérifié | Code relu ; durée non chronométrée en navigateur |

### F-03 : confirmation native pour la purge d'un champ

| Champ | Contenu |
|---|---|
| Gravité | mineur |
| Critère violé | T1 (aussi N4) |
| Nature | fait observé |
| Preuve | `apps/web/src/pages/TrackerConfigPage.tsx:53` : `window.confirm(...)` ; `DESIGN.md` §3.11 et §5.7 prescrivent la modale du système. |
| Impact utilisateur | Boîte du navigateur non stylée, incohérente avec le reste. |
| Correction recommandée | Réutiliser la modale de F-01 (`{component.modal}`, `{component.button.danger}`). |
| Effort | S (après F-01) |
| Vérifié | Code relu |

### F-04 : neuf arrêts de tabulation avant chaque contenu, sans lien d'évitement

| Champ | Contenu |
|---|---|
| Gravité | mineur |
| Critère violé | A2 |
| Nature | fait observé, puis interprétation |
| Preuve | `collect2.mjs` : 9 contrôles hors `<main>` ; `evidence/results.json` (`order`) : sur les 11 écrans, les 9 premiers arrêts sont la barre latérale ; `App.tsx:73` n'a pas de lien d'évitement. |
| Fait observé | Atteindre le premier champ d'une page demande 9 `Tab` au clavier. Les repères `main` et `nav` nommé existent. |
| Impact utilisateur | Perte d'efficacité quotidienne au clavier. Interprétation : le critère 2.4.1 (A) est probablement satisfait par les repères ; un lien d'évitement reste attendu pour un outil au clavier. |
| Correction recommandée | Premier élément focalisable « Aller au contenu », visible au focus avec `{semantic.focus.ring}`. |
| Effort | S |
| Vérifié | Mesuré (nombre d'arrêts) ; lecteur d'écran non testé |

### F-05 : textes de 8 à 10 px

| Champ | Contenu |
|---|---|
| Gravité | mineur |
| Critère violé | H1 (aussi T1) |
| Nature | fait observé |
| Preuve | `styles.css:137` `.ath-sidebar__sub` 9 px (valeur hors échelle) avec `opacity: 0.75` alors que le token `{opacities.sidebar-subtitle}` vaut 0,45 ; `.ath-th__sort` 8 px ; `.ath-stat__label` 10 px ; `.ath-tag` 10 px (`results.json`, champ `tiny`). Plancher de 11 px : `DESIGN.md` §1, `{fontSizes.xs}`. |
| Fait observé | Le contraste du sous-titre reste conforme (calculé ≥ 8:1 à 0,75) ; seule la taille est en cause. |
| Impact utilisateur | Lisibilité réduite sur de petits écrans ou pour une vue fatiguée ; ces textes sont secondaires. |
| Correction recommandée | `{fontSizes.xs}` pour le sous-titre, le label de stat et l'indicateur de tri ; décider si `{fontSizes.2xs}` (tags, pastilles) reste toléré. |
| Effort | S |
| Vérifié | Mesuré dans le navigateur |

### F-06 : liens de clés de 15 à 19 px de haut

| Champ | Contenu |
|---|---|
| Gravité | suggestion |
| Critère violé | A5 |
| Nature | fait observé, puis interprétation |
| Preuve | `results.json` : `a.ath-link` 37×15 (Recherche, Mon travail), 40×17 (Board), 24×19 (Tableau de bord) ; coche native 13×13 (Création de tracker). `{sizes.touch-target-min}` = 24 px. |
| Fait observé | Les liens de clés sont plus petits que 24 px. |
| Impact utilisateur | Interprétation : l'exception d'espacement de WCAG 2.5.8 est vraisemblablement respectée (lignes espacées d'environ 39 px, cercle de 24 px sans autre cible) ; le clic à la souris est néanmoins précis. La coche native relève des contrôles du navigateur. |
| Correction recommandée | Hauteur minimale `{sizes.touch-target-min}` sur les liens de tableau (padding vertical). |
| Effort | S |
| Vérifié | Mesuré ; exception d'espacement non testée outil |

### F-07 : un titre long déborde de la page, les identifiants se coupent

| Champ | Contenu |
|---|---|
| Gravité | majeur |
| Critère violé | R1 |
| Nature | fait observé (contenu simulé) |
| Preuve | `evidence/liste-contenu-long.png` : un titre de 140 caractères sans espace injecté dans la liste donne `scrollWidth` 1650 pour une fenêtre de 1440 ; la colonne Statut sort de l'écran et `BUG-1` se coupe en `BUG-` / `1`. Aucune règle `white-space: nowrap` dans `styles.css`. `DESIGN.md` §5.2 : troncature à une ligne avec `title`. |
| Fait observé | Le tableau pousse la page en défilement horizontal ; la clé se coupe, contre le principe 4. |
| Impact utilisateur | Un titre contenant une URL ou un chemin masque les colonnes d'état et d'action. Interprétation : cas peu fréquent mais plausible dans un outil technique ; l'injection est un test, pas une donnée réelle. |
| Correction recommandée | Cellule de titre tronquée (`text-overflow: ellipsis`, `max-width`, attribut `title`) ; cellule d'identifiant en `{typography.mono}` avec `white-space: nowrap`. |
| Effort | S |
| Vérifié | Simulé par injection dans le DOM (aucune donnée créée) |

### F-08 : aucun état de chargement sur les boutons d'envoi

| Champ | Contenu |
|---|---|
| Gravité | mineur |
| Critère violé | P1 (aussi N1) |
| Nature | fait observé, puis interprétation |
| Preuve | Recherche de `aria-busy`, `busy`, `pending`, `submitting` dans `apps/web/src/pages` et `components` : aucune occurrence. `{states.loading}` (proposed) existe dans la charte. |
| Fait observé | Les boutons « Créer », « Ajouter », « Prendre » restent actifs pendant l'appel. |
| Impact utilisateur | Interprétation : un double clic peut envoyer deux fois ; le serveur répond alors 409 sur les clés uniques, d'autres actions (commentaire) pourraient être doublées. |
| Correction recommandée | Appliquer `{states.loading}` : contrôle désactivé, `aria-busy`, libellé suivi de « … ». |
| Effort | M |
| Vérifié | Code relu ; double envoi non testé |

### F-09 : sous 768 px, la barre latérale s'empile en tête et la recherche déborde

| Champ | Contenu |
|---|---|
| Gravité | mineur |
| Critère violé | R1 (aussi T1) |
| Nature | fait observé |
| Preuve | `evidence/recherche-375.png` : à 375 px la barre latérale occupe environ 380 px de hauteur avant le contenu ; `scrollWidth` 497 pour 375 ; `ListPage.tsx:102` `size={60}` sur le champ ATQL. `styles.css:191` empile simplement la barre ; `DESIGN.md` §2.3 prévoit un tiroir. Les écrans Projets (375), Tableau de bord (768), Configuration (1024) ne débordent pas. |
| Impact utilisateur | Outil de poste de travail : usage mobile occasionnel seulement ; lecture de la liste gênée. |
| Correction recommandée | Tiroir sous `{breakpoints.md}` ; largeur du champ en `max-width: 100%`. |
| Effort | M |
| Vérifié | Mesuré à 375, 720, 768, 1024 px ; la table elle-même est exemptée de reflow (WCAG 1.4.10) |

### F-10 : l'ATQL exige les clés techniques, l'interface affiche les libellés

| Champ | Contenu |
|---|---|
| Gravité | mineur |
| Critère violé | N2 (aussi N6) |
| Nature | fait observé |
| Preuve | `ListPage.tsx` `suggest()` : champs et mots-clés seulement ; la pastille affiche « En cours » alors que la requête doit contenir `status = in_progress` (placeholder : `status = open`). |
| Impact utilisateur | L'utilisateur doit connaître la clé technique d'un statut. |
| Correction recommandée | Suggérer les valeurs (clé en `{typography.mono}` à côté du libellé, règle §6.2). Pas de token nouveau. |
| Effort | M (appel API des valeurs possibles) |
| Vérifié | Code relu ; saisie réelle faite lors de la préparation du manuel |

### F-11 : le raccourci `Ctrl+K` n'est plus indiqué

| Champ | Contenu |
|---|---|
| Gravité | suggestion |
| Critère violé | N7 |
| Nature | fait observé |
| Preuve | `App.tsx` : l'indication a été retirée de l'en-tête à la demande du produit (2026-11-01) ; `DESIGN.md` §3.5 et §4.2 prescrivent de l'afficher en permanence. |
| Impact utilisateur | La palette n'est découvrable que par la documentation. |
| Correction recommandée | Indice discret dans le pied de la barre latérale, `{typography.mono}` en `{semantic.text.mute}`. Décision à arbitrer : la suppression était voulue. |
| Effort | S |
| Vérifié | Code relu |

### F-12 : aucune entrée d'aide dans l'interface

| Champ | Contenu |
|---|---|
| Gravité | suggestion |
| Critère violé | N10 |
| Nature | fait observé |
| Preuve | `evidence/projets.png` : ni lien d'aide, ni lien vers le guide (`docs/user/GUIDE.md` existe) dans la barre latérale ou l'en-tête. |
| Correction recommandée | Entrée « Aide » de `{component.nav-item}` à la même place sur toutes les pages (WCAG 3.2.6). |
| Effort | S |
| Vérifié | Observé sur 11 écrans |

### F-13 : la page Administration s'ouvre pour un utilisateur sans droit, puis échoue en erreurs

| Champ | Contenu |
|---|---|
| Gravité | mineur |
| Critère violé | N5 (aussi T1, N1) |
| Nature | fait observé |
| Preuve | `apps/web/src/pages/AdminPage.tsx` : aucun contrôle de rôle, contrairement à Organisation, Gestion de projet et Configuration (`web3.test.tsx` les couvre). `collect3.mjs` : `user.dev` et `pm.dev` ouvrent `/p/ARI/admin` et voient les quatre onglets ; l'API répond 403 sur `/v1/webhooks` et `/v1/plugins`. |
| Fait observé | Le lien est caché dans la navigation, mais l'adresse directe affiche la page ; les appels refusés produisent des toasts d'erreur. Le serveur refuse bien les écritures (403 vérifié). |
| Impact utilisateur | Écran incohérent avec les autres pages réservées, qui affichent « Réservé aux administrateurs. » ; message d'erreur éphémère (F-02) au lieu d'une explication. |
| Correction recommandée | Même message et même structure que `OrgAdminPage` : `{semantic.state.danger.fg}` pour la ligne d'erreur, aucun appel réseau. |
| Effort | S |
| Vérifié | Mesuré dans le navigateur et par l'API |

## 4. Synthèse

### 4.1 Score par critère

| Famille | Critères | Moyenne (0 à 3) |
|---|---|---|
| Nielsen | N1 à N10 | 1,8 (18 / 10) |
| Hiérarchie | H1 | 2,0 |
| Système | T1 | 2,0 |
| Accessibilité | A1 à A5 | 2,6 (13 / 5) |
| Densité | D1 | 3,0 |
| Performance | P1 | 2,0 |
| Robustesse | R1 | 1,0 |

### 4.2 Top 5 des problèmes

1. **F-01** (majeur) : suppressions irréversibles sans confirmation.
2. **F-02** (majeur) : les erreurs disparaissent après 5 s.
3. **F-07** (majeur) : un titre long déborde et coupe les identifiants.
4. **F-04** (mineur) : 9 arrêts de tabulation avant chaque contenu.
5. **F-09** (mineur) : barre latérale et recherche à 375 px.

### 4.3 Gains rapides

Gravité majeure et effort S : **F-02** (toasts), **F-07** (troncature et `nowrap`).

| Constat | Correction | Tokens |
|---|---|---|
| F-02 | Pas de disparition automatique pour les erreurs, pause au focus | `{durations.toast}` |
| F-07 | Ellipsis et `title` sur les titres, `nowrap` sur les clés | `{typography.mono}` |

### 4.4 Plan de correction priorisé

| Ordre | Constats | Action | Effort | Dépend de |
|---|---|---|---|---|
| 1 | F-02, F-07, F-05 | Corrections CSS et composant Toast (se propagent à tous les écrans) | S | |
| 2 | F-01, F-03 | Composant de confirmation sur `{component.modal}`, appliqué aux 4 suppressions | M | |
| 3 | F-04, F-06 | Lien d'évitement et hauteur minimale des liens | S | |
| 4 | F-08, F-10 | État de chargement des boutons, suggestion de valeurs ATQL | M | |
| 5 | F-09, F-11, F-12 | Tiroir mobile, indice `Ctrl+K`, entrée d'aide | M | décision produit pour F-11 |

### 4.5 Périmètre non vérifié

- Rôles `athena-user` et `athena-pm` : audités après coup sur 14 pages (`collect3.mjs`) : navigation réduite et rôle affiché corrects, axe 0 violation, aucun bouton d'administration visible, API 403 sur templates, utilisateurs, création de projet, webhooks et plugins ; une seule anomalie (F-13). Non vérifié : masquage de champs par rôle (aucun champ restreint dans les données).
- Onglet Développement avec données GitLab, plugins installés (widgets), pièces jointes en échec antivirus.
- Thème sombre : absent de l'interface.
- Lecteur d'écran (NVDA, VoiceOver) : non testé ; les noms accessibles sont lus par axe, pas écoutés.
- États d'erreur serveur (500, session expirée) et chargement lent : non provoqués.
- Contenu très long : un seul cas simulé (titre) ; commentaires, descriptions et noms de champs non testés.
- Conflit de version et transition refusée : vus à l'écran lors de la préparation du manuel, pas rejoués ici.
- Déplacement par glisser-déposer du board : alternative « Déplacer vers » présente (observée), glisser non testé.

## 5. Règles de rigueur (rappel)

Aucune proposition de re-design n'est faite ici. La suite éventuelle est `/design:redesign`, à partir de ces constats.
