# Lot 27 : gabarits de tableaux de bord

Préparé le 2026-11-18, à partir de la revue des propositions par l'utilisateur (formulaire « Gabarits de tableaux de bord » : 42 fiches, 41 validées, 1 à revoir). Pas encore ouvert : aucune ligne de code. Prochaine migration : **094**.

## Objet

L'administrateur définit, dans Organisation › Gabarits, des gabarits de tableau de bord à plusieurs onglets, par type de tableau de bord (Mon travail, Vue d'ensemble d'un projet, Avancement d'un projet, Portefeuille) et par rôle. Athena livre des gabarits prêts à l'emploi. Dans « Organiser », chaque personne choisit parmi les gabarits qui lui sont proposés (selon ses rôles, la nature du projet et son rôle dans le projet) et les copie dans son tableau de bord.

## Décisions de la revue

Validées telles que proposées : principes P1 à P11, nouveaux genres de cartes N1 à N9, gabarits H0, H2 à H8, O1 à O8, A1 à A3, F1 à F3.

- **P1** : un gabarit vise un seul type de tableau de bord et contient de 1 à 9 onglets nommés, chacun avec ses cartes sur la grille de 12 colonnes. Cible : rôles Athena, natures de projet (facultatif), rôle dans le projet (facultatif).
- **P2** : les gabarits livrés sont décrits dans le code et ne se modifient pas. L'administrateur peut les masquer ou les dupliquer en gabarits d'organisation modifiables.
- **P3** : écran d'administration dans Organisation › Gabarits, à côté des gabarits de projet et de tracker. Éditeur fondé sur la grille d'« Organiser ». Aperçu « voir comme » sur un projet ou un portefeuille choisi.
- **P4** : dans « Organiser », bouton « Partir d'un gabarit » avec deux modes : ajouter ses onglets, ou remplacer le tableau de bord. Le gabarit est copié, sans lien ensuite.
- **P5** : l'administrateur peut marquer un gabarit « par défaut » pour un couple type × rôle. Il est affiché tant que la personne n'a rien enregistré. À la livraison, il n'y a aucun défaut.
- **P6** : une personne qui a plusieurs rôles voit l'union des gabarits proposés. Le défaut suit cette priorité : administrateur, PMO, directeur, chef de projet, responsable d'équipe, finance, assurance produit, membre d'équipe.
- **P7** : les cartes d'un gabarit visent « le projet courant » ou « le portefeuille courant », jamais une clé en dur. Une carte peut être marquée « une par projet » ou « un par portefeuille ». Les requêtes portent sur des types de tracker, pas sur des clés.
- **P8** : la nature du projet se déduit de son gabarit normatif. Il y en a cinq : logiciel spatial, projet spatial, logiciel de défense, opération d'armement, générique.
- **P9** : la variante selon la personne vient de son rôle dans le projet (chef, membre, lecteur). On n'attribue pas de gabarit à une personne nommée.
- **P10** : un gabarit ne contient que des cartes permises à tous les rôles qu'il cible. Les données restent filtrées par les droits de la personne qui regarde.
- **P11** : les cartes de portefeuille peuvent se poser dans Mon travail (pour le PMO, le directeur et la finance), et les cartes de recherche et les graphiques dans un portefeuille.
- **R1 (remarques sur H0, H1, H2)** : les cartes Favoris et Récents sont redondantes avec le rail. Elles sont retirées de tous les gabarits livrés, mais restent au catalogue pour qui les veut.
- **R2 (H1 à revoir)** : l'onglet « Raccourcis » est supprimé. « Mes anomalies » passe dans l'onglet « Aujourd'hui », après « Mes tickets ». Il reste donc deux onglets, « Aujourd'hui » et « À prendre ».

## Écarts antérieurs encore ouverts

Le registre d'audit (`AUDIT-PLAN.md`) garde deux écarts de code : E19 (plugins `artifactTab` et `menuItem`) et E2 (identifiants PostgreSQL dynamiques OpenBao). La règle de `CLAUDE.md` veut qu'ils soient comblés, ou acceptés comme reportés par l'utilisateur, avant l'ouverture de ce lot.

## Tâches

Une tâche tient dans une session (environ 5 fichiers, environ 400 lignes). Chacune se termine par ses tests ciblés et la suite complète, au vert, avant le commit.

### Phase A : socle (API)

| Tâche | Contenu | Dépend de |
|---|---|---|
| T-0253 | ADR-0010 : modèle de gabarit de tableau de bord et règles P1 à P11, R1, R2 | — |
| T-0254 | Contexte d'une personne dans un projet : nature du projet et rôle dans le projet | T-0253 |
| T-0255 | Cartes relatives et cartes répétées (« une par projet », « un par portefeuille ») | T-0253 |
| T-0256 | Portée élargie des genres de cartes (P11) et catalogue par rôle mis à jour | T-0253 |
| T-0257 | Gabarits d'organisation : stockage (migration 094), administration, duplication, masquage des livrés | T-0255 |
| T-0258 | Gabarits proposés à une personne, application (ajouter ou remplacer) et gabarit par défaut | T-0254, T-0257 |

**T-0253 : ADR-0010.**
Consigner les décisions de ce plan, les liens avec ADR-0005 et ADR-0007 (grille, onglets), et ce qui reste hors périmètre.
- *Acceptation* : l'ADR couvre P1 à P11, R1 et R2, et la priorité des rôles. `STATE.md` mentionne le lot.

**T-0254 : contexte projet de la personne.**
L'API fournit la nature d'un projet (les cinq natures de P8) et le rôle de la personne dans ce projet (chef, membre ou lecteur).
- *Acceptation* : un projet sans gabarit normatif est « générique ». Un projet sur le gabarit Spatial est « logiciel spatial ». Sur ECSS-M-ST-10, c'est « projet spatial ». Sur Défense, « logiciel de défense ». Sur IM 1618, « opération d'armement ». Une personne qui voit le projet sans en être membre est « lecteur ». Le chef de projet limité à ses projets (migration 092) n'obtient rien sur un projet qu'il ne dirige pas.

**T-0255 : cartes relatives et répétées.**
Une carte de gabarit peut viser le projet ou le portefeuille courant, ou être marquée « une par projet » ou « un par portefeuille ». À l'application, elle se résout en cartes ordinaires.
- *Acceptation* :
  - Appliquée à un projet, une carte relative porte la clé de ce projet.
  - Dans Mon travail, une carte « une par projet » est répétée pour chaque projet concerné (chef ou membre, selon le gabarit), dans la limite de 24 cartes par onglet. Au-delà, un message dit combien de projets n'ont pas été posés.
  - Les cartes répétées sont placées sans chevauchement.

**T-0256 : portée élargie (P11).**
- *Acceptation* :
  - Le PMO, le directeur et la finance peuvent poser une carte de portefeuille dans Mon travail, avec le portefeuille en réglage.
  - Un tableau de bord de portefeuille accepte les recherches et les graphiques, limités aux projets du portefeuille.
  - Le catalogue de la finance est défini.
  - Les refus actuels restent pour les rôles non concernés.

**T-0257 : gabarits d'organisation.**
Enregistrer, modifier, supprimer un gabarit d'organisation. Dupliquer un gabarit livré. Masquer ou réafficher un gabarit livré. Réservé à l'administrateur.
- *Acceptation* :
  - Un gabarit dont une carte n'est pas permise à l'un des rôles ciblés est refusé (P10).
  - Les limites tiennent : 9 onglets, 24 cartes par onglet, aucun chevauchement, requêtes ATQL valides.
  - L'isolation d'organisation est vérifiée par le test d'architecture RLS.
  - Le contrat OpenAPI et les SDK sont régénérés.

**T-0258 : proposition, application, défaut.**
- *Acceptation* :
  - Une personne ne reçoit que les gabarits de ses rôles (union, P6), non masqués. Pour un projet, ils sont aussi filtrés par la nature et par son rôle dans le projet, ceux de la nature en tête (P8, P9).
  - « Ajouter » ajoute les onglets sans toucher aux existants (nom en double suffixé), dans la limite de 8 onglets nommés.
  - « Remplacer » remplace l'onglet principal et supprime les onglets nommés. Une confirmation est exigée côté interface.
  - L'administrateur peut marquer un gabarit par défaut pour un couple type × rôle. Une personne sans disposition voit ce défaut, selon la priorité des rôles, et sa première sauvegarde en fait une copie.
  - Sans défaut, le tableau de bord reste vide.

### Phase B : interfaces

| Tâche | Contenu | Dépend de |
|---|---|---|
| T-0259 | Organisation › Gabarits › Tableaux de bord : liste, filtres, masquer, dupliquer, supprimer, défaut par rôle | T-0257, T-0258 |
| T-0260 | Éditeur de gabarit : onglets, grille, catalogue, cible (type, rôles, natures, rôle dans le projet), cartes relatives et répétées | T-0259 |
| T-0261 | Aperçu « voir comme » d'un gabarit sur un projet ou un portefeuille choisi | T-0260 |
| T-0262 | « Partir d'un gabarit » dans Organiser : liste proposée, aperçu des onglets, ajouter ou remplacer | T-0258 |

**T-0259 : liste d'administration.**
Troisième volet d'Organisation › Gabarits.
- *Acceptation* :
  - La liste est filtrable par type et par rôle.
  - Les gabarits livrés sont reconnaissables et non modifiables.
  - Les actions masquer, réafficher, dupliquer, supprimer (organisation seulement) et « par défaut pour… » sont disponibles.
  - Contrôle axe sans défaut. Thèmes et contrastes respectés.

**T-0260 : éditeur.**
Reprend la grille d'« Organiser » (glisser, clavier, réglages, catalogue) et ses onglets. Ajoute les champs du gabarit.
- *Acceptation* :
  - Le catalogue proposé est l'intersection des genres permis aux rôles ciblés.
  - Une carte se règle sur « projet courant », « portefeuille courant », « une par projet » ou « un par portefeuille ».
  - L'enregistrement affiche les refus de l'API en clair.
  - Tests web, clavier compris.

**T-0261 : aperçu.**
- *Acceptation* :
  - L'administrateur choisit un projet ou un portefeuille et voit le gabarit rendu avec ses données réelles, cartes répétées comprises, sans rien enregistrer.
  - L'aperçu respecte les droits de l'administrateur.

**T-0262 : choix par l'utilisateur.**
- *Acceptation* :
  - Le bouton n'apparaît qu'en mode Organiser.
  - La liste ne montre que les gabarits proposés, avec leur description et leurs onglets.
  - « Ajouter » et « Remplacer » (après confirmation) sont disponibles. Le résultat reste un brouillon jusqu'à « Enregistrer ».
  - Si aucun gabarit n'est proposé, un message le dit.
  - Tests web.

### Phase C : nouveaux genres de cartes

Chaque tâche couvre l'éventuelle lecture de données côté API, la carte, ses états (chargement, vide, erreur), le catalogue par rôle, la traduction et les tests. Les cartes s'appuient sur les modules PPM existants : rien de nouveau n'est saisi.

| Tâche | Contenu | Dépend de |
|---|---|---|
| T-0263 | N1 « Finances du portefeuille » et N2 « Finances du projet » | T-0256 |
| T-0264 | N3 « Charge et capacité » (portefeuille, projet, mes équipes) | T-0256 |
| T-0265 | N4 « Feuille de route » (90 jours, portefeuille ou projet) | T-0256 |
| T-0266 | N5 « Phase et prochaine revue » | T-0254 |
| T-0267 | N6 « Portes et décisions à venir » et N7 « Demandes à instruire » | T-0256 |
| T-0268 | N8 « Risques consolidés » (matrice probabilité × impact) | T-0256 |
| T-0269 | N9 « État de la plateforme » (administrateur) | T-0256 |

- **T-0263** : budget, engagé, réel, prévision à terminaison et écart par projet, ou pour le projet avec sa courbe prévu / réel. *Acceptation* : visible du PMO, du directeur, de la finance et de l'administrateur, et du chef du projet pour N2. Les taux restent masqués à qui ne les voit pas aujourd'hui. Les montants sont cohérents avec la page Finances.
- **T-0264** : charge contre capacité sur 12 semaines, surcharges signalées. *Acceptation* : trois périmètres (portefeuille, projet, équipes de la personne), cohérents avec la page Capacité.
- **T-0265** : jalons, revues et versions des 90 prochains jours sur une frise. *Acceptation* : retards signalés. Lisible au clavier et au lecteur d'écran (liste équivalente).
- **T-0266** : phase courante, prochaine revue, date, critères de sortie remplis ou restants, livrables. *Acceptation* : fonctionne pour les gabarits ECSS et IM 1618. Un projet sans cycle de vie affiche un état vide explicite.
- **T-0267** : revues et portes à 60 jours, décisions en attente d'application, dernières décisions, puis demandes triées par score avec leur étape. *Acceptation* : cohérent avec les pages Revues, Décisions et Demandes, avec des liens vers elles.
- **T-0268** : matrice 5 × 5 des risques ouverts et les cinq plus critiques. *Acceptation* : périmètre projet ou portefeuille, cohérent avec le registre des risques. Couleurs de criticité conformes à la charte, avec un texte équivalent.
- **T-0269** : retard de la synchronisation GitLab, webhooks en échec, travaux en erreur, plugins désactivés, jetons proches de l'échéance. *Acceptation* : réservé à l'administrateur. Chaque ligne mène à l'écran qui permet d'agir.

### Phase D : gabarits livrés

Chaque tâche déclare des gabarits livrés et les vérifie par test :
- cartes permises aux rôles ciblés ;
- requêtes ATQL valides ;
- champs de graphique présents dans les trackers des natures visées (sinon, carte adaptée et écart noté) ;
- aucun chevauchement ;
- limites tenues.

R1 s'applique partout : ni Favoris ni Récents.

| Tâche | Contenu | Dépend de |
|---|---|---|
| T-0270 | Mon travail : H0 Essentiel, H1 Contributeur (révisé, R2), H2 Chef de projet, H5 Responsable d'équipe, H6 Assurance produit | T-0255, T-0257 |
| T-0271 | Mon travail : H3 PMO, H4 Directeur, H7 Finance, H8 Administrateur | T-0263 à T-0269 |
| T-0272 | Vue d'ensemble d'un projet : O1 à O4 (par rôle dans le projet) | T-0254, T-0263 à T-0268 |
| T-0273 | Vue d'ensemble d'un projet : O5 Revues ECSS, O6 Jalons IM 1618, O7 AQAP, O8 Agilité (par nature) | T-0272 |
| T-0274 | Avancement : A1 Itératif, A2 Cycle en V normatif, A3 Ingénierie logicielle ; Portefeuille : F1 PMO, F2 Direction, F3 Contrôle financier | T-0263 à T-0268 |

### Phase E : livraison

| Tâche | Contenu | Dépend de |
|---|---|---|
| T-0275 | Parcours de bout en bout | phases B à D |
| T-0276 | Documentation, données de démonstration, vérification du lot | T-0275 |

**T-0275 : parcours de bout en bout (e2e Playwright).**
- L'administrateur duplique un gabarit livré, le modifie et le marque par défaut pour un rôle.
- Une personne de ce rôle le voit sans rien faire, puis l'adapte.
- Une autre applique un gabarit de projet sur un projet spatial et retrouve l'onglet « Revues ECSS ».
- Un chef de projet limité à ses projets ne voit, dans les cartes répétées, que ses projets.

**T-0276 : documentation et vérification.**
- Le guide utilisateur (choisir un gabarit) et le guide d'administration (définir, masquer, marquer par défaut) sont rédigés.
- La démonstration laisse les tableaux de bord vides et ne marque aucun défaut (choix de l'utilisateur du 2026-11-18).
- `LOT27-VERIFICATION.md` est vérifié critère par critère. `STATE.md` est à jour.
- Arrêt pour compte rendu.

## Hors périmètre

- Attribuer un gabarit à une personne nommée (P9).
- Mettre à jour automatiquement les copies quand un gabarit change (P4).
- Partager un tableau de bord entre personnes.
- Réordonner les onglets par glisser-déposer.
