# PPM Athena — 04. Fonctionnalités et visualisations

## Résumé

1. **V1 = F7 (santé, tableaux de bord), F3 (roadmap) et la partie lecture de F6 (gates, risques)**. Ces fonctionnalités se nourrissent de données déjà saisies ou de saisies légères (dates macro, météo du projet).
2. **V2 = F4 (capacité), F5 (finances), décisions et alertes de F6, dépendances inter-projets de F3.** **V3 = F1 (demandes), F2 (scoring et scénarios).**
3. **Aucune visualisation proposée n'est écartée** : à votre demande, une bibliothèque de graphiques, Apache ECharts, couvre les formes que les composants SVG maison ne savent pas faire. 51 visualisations sont retenues, dont 13 en V1 ; certaines sont seulement **reportées** parce que leurs données n'existent pas encore (§ 0.3).
4. Chaque visualisation a sa vue tableau exportable en CSV et mène à l'objet source.
5. Les maquettes de quatre écrans sont dans `docs/ppm/maquettes/`.
6. **Décisions attendues** : valider la répartition par incrément (I1 à I8, détaillée en phase 3) et les écarts de visualisation (§ 0.3).

---

## 0. Cadre commun

### 0.1 Règles appliquées à toutes les visualisations
- **Composants** : deux familles.
  - **Composants maison existants** pour ce qu'ils font déjà bien : tableaux (`Table`), anneau et barres simples (`ChartCard.tsx`), barres d'avancement (`ReleaseCharts.tsx`), Gantt et timelines (`ScheduleGantt.tsx`).
  - **Apache ECharts** (licence Apache 2.0) pour toutes les autres formes : carte de chaleur, courbe en S, cascade, graphique à puces, bulles, entonnoir, histogramme, radar, treemap, Sankey, graphe de dépendances, matrice, courbe MTA.
- **Pourquoi ECharts** :
  - Une seule bibliothèque couvre toutes les formes demandées.
  - Les modules s'importent un par un (seuls les types utilisés entrent dans le paquet).
  - Le rendu SVG est vectoriel et s'imprime net.
  - Les motifs de remplissage (*decal*) distinguent les séries sans la couleur.
  - L'option `aria` génère une description textuelle.
  - Les thèmes se règlent par objet, ce qui permet de lire les jetons du thème Athena actif.
  - Elle est empaquetée au build : aucun appel réseau, compatible avec le réseau isolé.
- Les alternatives étudiées couvrent moins de formes :
  - Observable Plot n'a ni Sankey, ni treemap, ni graphe natifs.
  - Recharts n'a ni Sankey, ni graphe, ni motifs.
  - Chart.js est en canvas seul, moins accessible et moins net à l'impression.
- **Intégration** : un composant unique `<Chart>` dans `@athena/ui`. Il charge ECharts à la demande (chunk séparé : aucune page sans graphique ne paie son poids), force le rendu SVG, construit le thème ECharts depuis les jetons sémantiques (`data.1-8`, statuts, texte, surfaces) dans les 11 thèmes et les deux modes, active `aria` et les motifs, et affiche sous le graphique la bascule vers la vue tableau.
- **Hypothèses à vérifier** (tâches du backlog) :
  - H-V1 : le rendu SVG d'ECharts respecte la CSP de production (`style-src 'self'`, sans style en ligne). Impact si faux : rendu dans un canvas, ou politique de style adaptée pour ce seul composant.
  - H-V2 : le poids importé à la carte reste sous 200 Ko compressés. Impact si faux : charger les modules par page.
- Couleurs issues de la palette de données `data.1-8` et des jetons de statut des thèmes, déjà contrôlés en contraste (cartographie § 10).
- **La couleur ne porte jamais seule l'information** : libellé de santé en toutes lettres, motif hachuré pour « forcé », forme (losange) pour un jalon, valeur écrite dans les cellules de carte de chaleur.
- **Vue tableau équivalente** sous chaque graphique (bascule « Graphique / Tableau »), export CSV avec le bandeau de marquage existant (`export-marking.ts`).
- **Navigation** : chaque barre, cellule, point ou ligne est un lien vers le projet, la phase, le ticket ou la version d'origine.
- **États** : *vide* (phrase et action nommée, comme les cartes du lot 13) ; *partiel* (mention permanente « périmètre : projets que vous pouvez voir », sans dire ce qui manque) ; *dégradé* (donnée absente : « date de fin non renseignée » ; donnée périmée : « calculé le … » si elle vient d'un instantané ou d'une matérialisation).
- **Volumétrie** : seuils indiqués par visualisation (palier 2 : 300 projets par instance).

### 0.2 Impression et PDF
Une feuille de style d'impression (`@media print`) met en page la fiche projet d'une page et le dossier de revue. Le PDF s'obtient par l'impression du navigateur, sans dépendance serveur. Un PDF généré côté serveur est écarté en V1 : il imposerait un navigateur sans tête dans l'image, ce qui est lourd et délicat en réseau isolé.

### 0.3 Visualisations reportées (aucune n'est écartée)

Avec ECharts, la contrainte de rendu disparaît. Les visualisations ci-dessous sont **retenues**, mais à la version où leurs données existent.

| Visualisation | Fonction | Version | Composant | Ce qui conditionne la version |
|---|---|---|---|---|
| Entonnoir des demandes, taux de conversion et de refus | F1 | V3 | ECharts `funnel` | Demandes (tracker `request`) |
| Histogramme des délais de traitement par étape, repère de l'objectif | F1 | V3 | ECharts `bar` + `markLine` | Historique des transitions des demandes (existant, via les révisions) |
| Radar ou barres par critère d'une demande | F1, F2 | V3 | ECharts `radar` (barres en vue alternative) | Modèle de scoring |
| Diagramme de flux objectifs → portefeuilles → initiatives | F2 | V3 | ECharts `sankey` | Objectifs stratégiques |
| Analyse de sensibilité des pondérations | F2 | V3 | ECharts `line` (rang selon le poids) | Modèle de scoring |
| Treemap de l'investissement par axe, contre la cible | F2, F5 | V3 (axes) ; V2 par catégorie | ECharts `treemap` | Axes stratégiques ; catégories de dépense en V2 |
| Matrice de dépendances inter-projets | F3 | V2 | ECharts `heatmap` (projet × projet) | Dépendances inter-projets (P3) |
| Superposition what-if sur la roadmap | F3 | V3 | `ScheduleGantt` (calque) | Scénarios |
| Matrice de compétences équipe × compétence | F4 | V3 | ECharts `heatmap` | Référentiel de compétences |
| Avant/après d'un scénario de capacité (différence) | F4 | V3 | ECharts `heatmap` divergente | Scénarios |
| Quadrant coût/délai (CPI, SPI) | F5 | V3 | ECharts `scatter` + `markArea` | Avancement pondéré et coûts fiables |
| Carte de chaleur des écarts budgétaires projet × période | F5 | V2 | ECharts `heatmap` | Réels et prévisions |
| Trajectoire d'un risque entre deux revues | F6 | V2 | ECharts `scatter` + flèches | Deux instantanés de revue |
| Historique des changements de périmètre, effet cumulé | F6 | V2 | ECharts `bar` (cascade) | Décisions de portefeuille |

---|---|---|
| Entonnoir des demandes | F1 | V3 et faible volume attendu ; le Kanban et la courbe entrées/sorties suffisent |
| Histogramme des délais par étape | F1 | Remplacé par une colonne « ancienneté » triable dans le Kanban |
| Radar par critère | F1, F2 | Lecture peu fiable (aires trompeuses) ; remplacé par des barres par critère |
| Diagramme de flux objectifs → initiatives | F2 | Pas d'objectifs stratégiques avant le V3 ; une liste « projets sans objectif » suffira |
| Analyse de sensibilité des pondérations | F2 | Disproportionnée pour la V3 initiale ; à réévaluer après usage du scoring |
| Treemap d'investissement | F2, F5 | Remplacée par des barres triées, plus lisibles et accessibles |
| Matrice de dépendances | F3 | Utile au-delà de 30 projets liés ; le graphe filtré suffit au palier 2 |
| Superposition what-if sur la roadmap | F3 | V3 avec les scénarios |
| Matrice de compétences | F4 | Aucune donnée de compétences (reportée au V3) |
| Avant/après d'un scénario de capacité | F4 | V3 |
| Quadrant coût/délai (CPI, SPI) | F5 | Exige avancement pondéré et coûts fiables : reporté au V3 |
| Carte de chaleur des écarts budgétaires | F5 | Redondante avec le tableau des écarts à mini-courbes |
| Trajectoire d'un risque entre deux revues | F6 | V2, quand les instantanés auront deux revues d'historique |
| Historique des changements de périmètre | F6 | V2 : dépend des décisions de portefeuille |

---

## F7 — Tableaux de bord et reporting [V1, Must]

**Objectif** : donner en une page l'état fiable d'un portefeuille et préparer une revue sans recopie. **Utilisateurs** : direction, PMO, chef de projet.

**Description et règles**
- Le tableau de santé du lot 16 (`PortfoliosPage.tsx`) devient la vue principale : une ligne par projet avec santé calculée et déclarée, délai (fin prévue, fin calculée, écart à la baseline), phase et prochaine revue, retards, bloqués, avancement, risque maximal (après P5), météo et commentaire du chef de projet, tendance depuis l'instantané précédent.
- La santé calculée reste `healthOf` (`kpi.service.ts:29-36`). La santé forcée par le PMO (existante) est hachurée et porte sa note. La santé déclarée vient de la météo (`project_status_note`).
- **Tendance** : flèche ↑ ↓ → et libellé, par comparaison au dernier instantané, avec la date de l'instantané.
- **Vue direction** : six tuiles au plus (projets critiques, en retard, revues dépassées, avancement moyen, risques critiques, et en V2 dépassement budgétaire), chacune menant au tableau filtré.
- **Portée de tableau de bord** `portfolio:<clé>` sur la grille existante. Nouveaux genres de cartes : santé du portefeuille, tuiles, roadmap compacte, matrice des risques, puis en V2 capacité et budget.
- **Dossier de revue** : la revue fige un instantané ; la page « revue » assemble tuiles, tableau de santé, roadmap des jalons, gates et risques. Elle s'imprime.
- **Alertes** (V2) : centre d'alertes sur seuils (retard de revue, critique depuis deux instantanés, dépassement budgétaire, surcharge).

**Données et source** : `kpi.service` (projet), `project` (P1), `project_phase` (P6), `project_status_note`, `portfolio_snapshot_line`, tickets de risque (P5).

**Écrans** : `/portefeuilles/:clé` (santé), `/portefeuilles/:clé/revues/:id`, tableau de bord `portfolio:<clé>`, fiche projet d'une page `/p/:projet/fiche`.

**Visualisations retenues**

| Visualisation | Question → décision | Persona | Encodage | Source et agrégat | Interactions | Composant | Coût, version |
|---|---|---|---|---|---|---|---|
| Tuiles d'indicateurs | Où regarder d'abord ? | Direction | Valeur, flèche de tendance, écart à la cible, libellé d'état | Totaux à la lecture | Clic : tableau filtré | `WidgetCards.tsx` | S, V1 |
| Tableau de santé | Quels projets traiter en revue ? | PMO, direction | Pastilles libellées (délai, risque, phase), hachure si forcé, flèche de tendance | Une ligne par projet visible | Tri, filtres (statut, sponsor, phase, santé), lien projet | `Table` de `@athena/ui` | M, V1 |
| Mini-courbes dans le tableau | La dérive s'installe-t-elle ? | PMO | Ligne des 6 derniers instantanés (retards, avancement) | `portfolio_snapshot_line` | Survol : valeurs datées | ECharts `line` (mini, sans axes) | S, V1 (après deux instantanés) |
| Comparaison entre instantanés | Qu'est-ce qui a changé depuis la revue ? | PMO | Tableau des écarts : santé, phase, dates, entrants et sortants | Deux instantanés | Choix des deux dates | `BaselineCompare.tsx` (même principe) | M, V1 |
| Fiche projet d'une page, dossier de revue | Support de revue sans recopie | PMO, chef de projet | Mise en page fixe, impression | Vues ci-dessus | Impression | `@media print` | M, V1 |
| Centre d'alertes | Quoi traiter, depuis quand, par qui ? | PMO, manager | Liste triée par ancienneté, cause liée | Règles d'alerte | Lien vers la cause | `Table` | M, V2 |

**États** : vide (« Aucun projet rattaché : rattachez un projet ») ; partiel (mention de périmètre) ; dégradé (« Fin non renseignée », « Aucune météo depuis 30 jours »).

**Permissions** : lecture par l'administrateur, le PMO, le directeur et le chef de projet (ses projets visibles) ; santé forcée et instantané manuel par le PMO et l'administrateur ; météo par le chef du projet.

**Réutilisation et nouveau** : réutilise `kpi.service`, `PortfoliosPage`, la grille de tableau de bord, le CSV et le marquage. Crée la météo, les instantanés, la portée `portfolio:` et la mise en page d'impression.

**Cas limites** : projet sans gabarit (pas de phase) ; projet dans deux portefeuilles (une ligne dans chacun, calcul mis en cache par requête, déjà en place) ; projet `closed` (masqué par défaut, filtrable) ; lecteur sans aucun projet visible (état vide, sans indice).

**Critères d'acceptation**
1. Pour un portefeuille de 50 projets, le tableau s'affiche en moins de 2 s au palier 1 (mesure en recette).
2. Un lecteur privé d'un projet par une liste d'ayants droit obtient des totaux, tuiles, instantanés et exports sans aucune trace de ce projet (test automatisé, comme `team-portfolio.test.ts`).
3. La tendance d'un projet compare au dernier instantané et affiche sa date.
4. Chaque cellule mène à l'objet source ; l'export CSV contient les mêmes lignes que la vue.
5. Le dossier de revue imprimé tient une page par projet critique et reprend l'instantané figé, pas les données du jour.

**Dépendances** : P1, météo, instantanés ; P5 pour le risque. **Estimation** : L (nombre d'écrans et règles de visibilité sur les instantanés). **Priorité** : Must. **Incréments** : I1 (tableau, météo, export), I3 (instantanés, revues, cartes).

---

## F3 — Roadmap et planification macro [V1 lecture, V2 dépendances]

**Objectif** : voir où en est chaque projet dans son cycle de vie et dans le temps, et repérer la dérive. **Utilisateurs** : PMO, direction, chefs de projet.

**Description et règles**
- Couloirs par projet (et regroupement par portefeuille). Dans chaque couloir : barre du projet (`planned_start` à `planned_end`), phases normatives (`project_phase`) en chevrons, revues (SRR, PDR…) en losanges, versions (`release`) en jalons.
- **Réel contre baseline** : barre fantôme de la baseline la plus récente du projet (`baseline_schedule`, fin la plus tardive) sous la barre courante, avec l'écart en jours ouvrés.
- **Fin calculée** : fin du planning détaillé (`computeSchedule`, fin la plus tardive des tâches). Elle s'affiche en marque si elle dépasse `planned_end`.
- **Niveau de détail remonté** : projet, phases, revues, versions. Les tâches ne remontent jamais au portefeuille ; on y accède en ouvrant le projet.
- **Dépendances inter-projets** (V2, P3) : flèches entre jalons de projets, propagation en lecture (« jalons touchés en aval »).
- **Publication** : la roadmap de référence d'une revue est l'instantané de cette revue.

**Données et source** : `project`, `project_phase`, `release`, `baseline_schedule`, et `GET schedule` existant (`planning.controller.ts:25`).

**Visualisations retenues**

| Visualisation | Question → décision | Persona | Encodage | Source et agrégat | Interactions | Composant | Coût, version |
|---|---|---|---|---|---|---|---|
| Timeline à couloirs | Quels projets glissent, et dans quelle phase ? | PMO, direction | x = temps (trimestre à 3 ans), une ligne par projet, chevrons de phase libellés, losanges de revue, couleur et libellé d'état | Par projet | Zoom temporel, repli par portefeuille, lien vers la phase ou la version, repère du jour | Moteur de rendu de `ScheduleGantt.tsx`, en lecture | M, V1 |
| Barres fantômes de baseline | De combien a-t-on dérivé ? | PMO | Barre pointillée sous la barre courante, écart chiffré | `baseline_schedule` | Choix de la baseline | Calque de baseline du lot 12 | S, V1 |
| Vue jalons seule | Diffuser les dates clés aux parties prenantes | Direction | Liste chronologique : revues et versions, prévu, réel, écart | `project_phase`, `release` | Filtre par période, impression | `Table` | S, V1 |
| Courbe de tendance des jalons (MTA) | Une revue dérive-t-elle de revue en revue ? | PMO | x = date de relevé, y = date prévue du jalon, une ligne par jalon, diagonale de référence | `project_phase_history` | Survol : date et auteur du changement | ECharts `line` + `markLine` | M, V1 (I3) |
| Graphe des dépendances inter-projets | Quel projet en bloque d'autres ? | PMO | Nœuds = projets, flèches = liens « précède », épaisseur = nombre de liens, rouge et libellé si critique | Liens P3 | Filtre par portefeuille, clic : liste des liens | ECharts `graph` | M, V2 |
| Propagation d'un retard | Si ce jalon glisse de 10 jours, qui est touché ? | PMO | Jalons aval surlignés avec le décalage induit | `computeSchedule` étendu aux contraintes externes | Saisie d'un décalage hypothétique, rien n'est écrit | Calcul pur existant | M, V2 |

**Volumétrie** : au-delà de 50 couloirs, regroupement par portefeuille replié par défaut ; au-delà de 300 projets, filtres obligatoires.

**Permissions** : lecture selon la visibilité des projets ; aucune écriture depuis la roadmap de portefeuille en V1 (les dates se modifient dans le projet).

**Cas limites** : projet sans dates (couloir « non planifié » en fin de liste) ; phase sans dates (chevron grisé « non daté ») ; baseline antérieure à la migration 060 (couverte par `061`) ; revue tenue après la fin prévue (marque « tenue en retard »).

**Critères d'acceptation**
1. La roadmap d'un portefeuille de 50 projets s'affiche en moins de 2 s, avec phases, revues et versions.
2. Chaque élément ouvre la page d'origine (phase dans la fiche gabarit, version dans Planning > Versions).
3. L'écart à la baseline est égal, au jour près, à celui du Gantt du projet (test de concordance).
4. La courbe MTA d'une revue reflète chaque changement de date prévue, avec son auteur.

**Dépendances** : P1, P6 (I2) ; P3 (V2). **Estimation** : L (rendu multi-projets, MTA). **Priorité** : Must (V1), Should (dépendances). **Incréments** : I2, I3 (MTA), I5 (dépendances).

---

## F6 — Gouvernance, risques et décisions [V1 partiel, V2]

**Objectif** : savoir quels gates passent, lesquels bloquent et pourquoi ; voir l'exposition aux risques ; tracer les décisions.

**Description et règles**
- **Cycle de vie** : celui du gabarit normatif (`normative-template.ts:28-34`). Un gabarit « cycle projet spatial 0/A-F » s'ajoute dès réception des documents d'entrée (vision § 6).
- **Gates** : passage = critères de sortie de la phase courante **et** d'entrée de la suivante ; critère manuel confirmé et daté (fait en `064`). V1 ajoute les dates prévues et réelles de revue et la décision (`project_phase`).
- **Risques** : agrégation des tickets de type `risk` des projets visibles, sur les rôles sémantiques `probability` et `impact` (P5). Les risques transverses (V2) sont des tickets du projet de pilotage du portefeuille.
- **Décisions de portefeuille** (V2) : enregistrées en revue, liées aux projets, avec responsable, conditions et échéance ; notifications par le mécanisme existant (`044_notifications.sql`).
- **Actions** : agrégat des tickets `action` et RID ouverts (existants).

**Visualisations retenues**

| Visualisation | Question → décision | Persona | Encodage | Source et agrégat | Interactions | Composant | Coût, version |
|---|---|---|---|---|---|---|---|
| Frise des stage gates d'un projet | Peut-on tenir la prochaine revue ? | Chef de projet, PMO | Chevrons de phase, état de chaque critère (✓ rempli, ○ à confirmer, nombre restant), revue suivante datée | `phaseCheck`, `project_phase` | Lien vers les RID ouverts, confirmation (droits) | `ProjectTemplateCard.tsx` étendu | S, V1 |
| Tableau de passage des gates | Quels projets ont une revue en retard ou bloquée ? | PMO, AQ | Projets × revues : date prévue, réelle, décision libellée, retard en jours | `project_phase` | Tri, filtre, lien vers le projet | `Table`, comme `MatrixView.tsx` | M, V1 |
| Matrice des risques probabilité × impact | Où est l'exposition du portefeuille ? | Direction, PMO | Grille 5 × 5, nombre écrit dans chaque case, paliers libellés | Tickets `risk` visibles | Clic sur une case : liste des risques | ECharts `heatmap` (valeur écrite) | S, V1 (après P5) |
| Exposition aux risques dans le temps | Le portefeuille se dérisque-t-il ? | Direction | Barres empilées ouverts, mitigés, clos par instantané, plus criticité cumulée en ligne | Instantanés | Survol | ECharts `bar` empilé + `line` | M, V2 |
| Journal des décisions | Qui a décidé quoi, et qu'est-ce que cela a changé ? | PMO, auditeur | Frise chronologique filtrable, lien vers les éléments touchés | `portfolio_decision` | Filtre par projet et type | `Table` + frise | M, V2 |
| Suivi des actions | Qu'est-ce qui traîne, et chez qui ? | PMO, manager | Ouvertes et en retard par responsable, ancienneté | Tickets `action`, RID | Lien vers le ticket | `ChartCard` (barres) | S, V1 |

**Permissions** : confirmation de critère et décision de gate par le chef de projet et l'administrateur (plus l'AQ si le gabarit le prévoit) ; décisions de portefeuille (V2) par le PMO et l'administrateur, lecture par la direction.

**Cas limites** : changement de version du gabarit pendant une phase (la clé de phase disparaît : la ligne `project_phase` est conservée et marquée « hors gabarit ») ; critère manuel dont le libellé change à la montée de version (la confirmation ne correspond plus et redevient « à confirmer », comportement voulu et documenté) ; risque sans probabilité ni impact (« non évalué », compté à part).

**Critères d'acceptation**
1. Aucun passage de phase n'est possible tant qu'un critère manuel n'est pas confirmé (fait, `normative-templates.test.ts`).
2. Le tableau de passage montre pour chaque projet la revue suivante et le retard éventuel, au jour près.
3. La matrice compte exactement les risques ouverts des projets visibles ; un risque d'un tracker masqué n'est pas compté (test).
4. Toute décision ou confirmation figure dans `audit_log` avec son auteur.

**Dépendances** : P5, P6. **Estimation** : M en V1, M en V2. **Priorité** : Must (gates, matrice), Should (décisions). **Incréments** : I2 (frise), I3 (tableau de passage, matrice, actions), I7 (décisions, exposition).

---

## F4 — Ressources, compétences et capacité [V2, Should]

**Objectif** : savoir si les équipes peuvent tenir les engagements, avant de les prendre. **Utilisateurs** : manager, PMO, direction.

**Description et règles** (modèle en `03-modele-donnees.md` § 2.9)
- Unité de stockage : la minute ; toute durée se saisit en heures et minutes ; le jour et l'ETP se déduisent du calendrier et de `workday_minutes` (organisation ou personne).
- Granularité semaine ou mois, réglée par projet (saisie des allocations) et par portefeuille (affichage). La conversion se fait au prorata des jours ouvrés.
- Capacité = disponibilité × jours ouvrés − absences. Charge planifiée = allocations. Charge restante = `remaining` en heures. Consommé = `worklog`.
- Besoin générique par rôle (« 0,5 ETP de thermicien ») tant que la personne n'est pas nommée ; une allocation nominative le remplace.
- Surcharge : charge > capacité de plus de 10 % sur une période (seuil réglable par l'organisation).
- La charge du lot 16 (tickets ouverts) reste disponible comme indicateur immédiat.

**Visualisations retenues**

| Visualisation | Question → décision | Persona | Encodage | Source et agrégat | Interactions | Composant | Coût, version |
|---|---|---|---|---|---|---|---|
| Carte de chaleur ressource × période | Qui est surchargé, et quand ? | Manager, PMO | Cellule = taux de charge, **valeur écrite**, 4 paliers libellés (sous-charge, normal, tendu, surcharge) | Personne ou équipe × période | Regroupement équipe, rôle ; clic : allocations de la cellule | ECharts `heatmap` (`visualMap` par paliers, valeur écrite) | M, V2 |
| Histogramme empilé par projet avec ligne de capacité | Quel projet consomme l'équipe ? | Manager | Barres empilées par projet (libellées), ligne de capacité | Équipe × période | Filtre de rôle, lien vers le projet | ECharts `bar` empilé + `markLine` | M, V2 |
| Planning d'affectation par personne | Sur quoi travaille chacun, et quand est-il absent ? | Manager | Une ligne par personne, barres par projet, absences hachurées | Allocations, absences | Lien vers le projet | Rendu de `ScheduleGantt` | M, V2 |
| Besoin contre capacité par rôle | Faut-il recruter ou sous-traiter ? | Direction, PMO | Deux courbes sur l'horizon, écart ombré et chiffré | Rôle × période | Choix du rôle | ECharts `line` + `areaStyle` | S, V2 |
| Liste des goulots | Quels rôles saturent, et quels projets en dépendent ? | PMO | Tableau trié par taux de saturation | Rôle × période | Lien vers les projets | `Table` | S, V2 |
| Planifié contre consommé | Les estimations sont-elles fiables ? | PMO, chef de projet | Barres groupées par période | Allocations, worklog | Lien vers le projet | `ChartCard` (barres) | S, V2 (après worklog) |

**Volumétrie** : carte de chaleur nominative jusqu'à 100 personnes ; au-delà, agrégée par équipe avec navigation descendante.

**Permissions** : une personne voit sa propre charge ; le manager voit ses équipes (règle du lot 16) ; le PMO et la direction voient tout, sans le motif des absences ; les allocations se saisissent par le chef de projet (ses projets) et le manager (ses équipes).

**Cas limites** : personne dans deux équipes (sa capacité compte une fois et se répartit par allocation) ; semaine à cheval sur deux mois ; absence d'une demi-journée ; projet `on_hold` (allocations gelées, signalées) ; ticket sans `remaining` (« non estimé », compté à part).

**Critères d'acceptation**
1. Pour une personne à 80 %, avec un jour férié et deux jours d'absence dans le mois, la capacité calculée est égale au calcul manuel de référence (test unitaire).
2. La même allocation affichée en semaines puis en mois donne le même total sur le mois (test de conversion).
3. Un manager ne voit aucune donnée d'une personne hors de ses équipes.

**Dépendances** : P4 (unité, `workday_minutes`), calendrier (`059`). **Estimation** : XL (nouveau modèle, saisie, calcul différé, quatre vues). **Priorité** : Should. **Incréments** : I4 (capacité, allocations, carte de chaleur), I5 (worklog, planifié contre consommé).

---

## F5 — Finances et pilotage budgétaire [V2, Should]

**Objectif** : suivre budget, engagé, réel et prévision par projet, et alerter avant le dépassement. **Utilisateurs** : PMO, direction, finance.

**Description et règles** (modèle en `03` § 2.10)
- Budget courant = initial + avenants + arbitrages (lignes en ajout seul, chacune justifiée).
- Saisie manuelle **et** import CSV (gabarit de colonnes publié, réimport idempotent par empreinte, rapport d'erreurs ligne à ligne). L'intégration externe est un point d'extension (webhook entrant au même format).
- EAC (prévision à terminaison) = réel + prévisions des périodes futures. Écart = EAC − budget courant. Alerte quand l'écart dépasse 5 % (réglable).
- Coût des ressources (V2b) : heures du worklog × taux. Les taux ne sont lisibles que par la finance et l'administrateur.

**Visualisations retenues**

| Visualisation | Question → décision | Persona | Encodage | Source et agrégat | Interactions | Composant | Coût, version |
|---|---|---|---|---|---|---|---|
| Courbe en S cumulée | Le projet consomme-t-il au rythme prévu ? | PMO, finance | Lignes cumulées budget, engagé, réel, EAC, libellées en bout de ligne | Projet × mois | Survol : valeurs du mois | ECharts `line` | M, V2 |
| Barres budget, réel, EAC par projet | Quels projets vont dépasser ? | Direction | Barres groupées triées par écart, écart écrit | Portefeuille | Lien vers le projet | `ChartCard` (barres) | S, V2 |
| Graphique à puces par projet | Où en est la consommation à date ? | PMO | Barre du consommé, repère « prévu à date », fond de l'enveloppe | Projet | Lien vers les lignes | ECharts `bar` (graphique à puces composé) | S, V2 |
| Cascade du budget | D'où vient le budget actuel ? | Direction, finance | Barres flottantes initial → avenants → arbitrages → courant, chacune libellée et liée à sa décision | `budget_line` | Lien vers la décision | ECharts `bar` empilé transparent (cascade) | S, V2 |
| Répartition par catégorie | Où va l'argent du portefeuille ? | Direction | Barres triées par catégorie | Portefeuille × catégorie | Filtre de période | `ChartCard` (barres) | S, V2 |
| Tableau des écarts avec mini-courbes | Quelles tendances d'écart ? | PMO | Une ligne par projet, mini-courbe des 6 derniers mois | Projet × mois | Tri | `Table` | S, V2 |

**Permissions** : budgets et réels saisis par le PMO et la finance ; lus au niveau projet par le chef de projet ; montants agrégés lus par la direction ; taux des ressources réservés à la finance et à l'administrateur.

**Cas limites** : réel importé pour un projet inconnu (ligne rejetée et rapportée) ; double import du même fichier (refusé par l'empreinte) ; devise différente de celle du portefeuille (refusé, pas de conversion) ; période close (correction par écriture compensatoire, jamais par modification).

**Critères d'acceptation**
1. Un import de 1 000 lignes dont 3 erronées enregistre 997 lignes et rapporte les 3 avec leur motif.
2. EAC et écart sont égaux au calcul de référence d'une feuille de contrôle (test).
3. Un utilisateur sans rôle finance ne peut obtenir aucun taux, ni par l'API ni par un export.

**Dépendances** : rôle finance (à créer), décisions de portefeuille (pour les arbitrages liés). **Estimation** : L. **Priorité** : Should. **Incrément** : I6.

---

## F1 — Demandes et pipeline [V3, Could]

**Objectif** : canaliser les demandes de projet et les instruire de façon traçable.

**Conclusion sur l'existant** : le mécanisme de trackers **suffit** à porter la demande. Il fournit le formulaire paramétrable (champs, disposition `028`), le workflow avec validateurs, le circuit d'approbation (`046`), les commentaires, les pièces jointes et l'historique Git. Il manque seulement le type `request`, un projet de pilotage par portefeuille et l'action « convertir en projet » (création depuis un gabarit et lien de réalisation).

**Visualisations retenues** : Kanban du pipeline, avec ancienneté et marque « bloquée » (le Board existant, carte enrichie du lot 9) ; courbe des entrées et sorties par mois (ECharts `line`) ; tableau comparatif de deux à cinq demandes (`Table`) ; entonnoir, histogramme des délais et radar par critère (§ 0.3).

**Critères d'acceptation** : une demande convertie crée un projet du gabarit choisi, liée à la demande ; un refus exige un motif et apparaît dans l'historique.

**Estimation** : M (la plupart des briques existent). **Priorité** : Could. **Incrément** : I8.

## F2 — Portefeuille et priorisation [V1 pour les portefeuilles (fait), V3 pour le scoring]

**Existant** : plusieurs portefeuilles, rattachement, ordre manuel (`portfolio_project.position`), santé forcée et note (lot 16).

**Score (V3)** : score = Σ (poids × valeur normalisée) / Σ poids des critères renseignés. Valeur normalisée = (v − min) / (max − min), inversée pour les critères « plus c'est bas, mieux c'est » (coût, risque). Un critère non renseigné est **exclu** du calcul, et le score affiche son taux de complétude ; en dessous de 70 % il est marqué « incomplet ». Changer les poids crée une nouvelle version du modèle ; les scores des anciennes versions restent lisibles.

**Visualisations retenues** (toutes en V3, ECharts) : diagramme à bulles valeur × risque (`scatter`, taille = charge ou coût, forme et libellé = axe, quadrants nommés par `markArea`) ; classement avec ligne de coupe (`bar` + `markLine` sur le cumul du budget et de la capacité) ; barres empilées de contribution par critère ; treemap de répartition contre la cible ; flux objectifs → initiatives (`sankey`) ; sensibilité des pondérations ; comparateur de scénarios (`Table`).

**Estimation** : XL (modèle de scoring, scénarios, quatre vues). **Priorité** : Could. **Incrément** : I8 et suivants.
