# Athena — Organisation de l'IHM et fonctionnalités

Nov 6, 2026 · @Laurent

## Contexte et objectifs

Athena est un outil de gestion du cycle de vie organisé autour de deux pivots : le **projet** et le **tracker**. Il reprend la structuration par projet et la configurabilité des trackers de Tuleap, ainsi que les vues multiples, la recherche et la navigation personnelle de Jira. Il corrige leurs défauts communs : hétérogénéité, administration dense, interfaces de générations différentes et navigation instable.

Objectifs mesurables visés :

- Trouver n'importe quel item en moins de 3 actions (palette de commandes ou fil d'Ariane).
- Garantir qu'un utilisateur qui connaît un projet sait lire n'importe quel autre projet sans formation complémentaire.
- Rendre la traçabilité exigence → conception → code → test visible sans plugin ni export.
- Permettre à un administrateur de projet de configurer un tracker sans casser la cohérence globale.

Périmètre : ingénierie des exigences, développement logiciel, vérification et validation, pilotage de projet. Hors périmètre du premier lot : gestion financière, support client (files d'attente type service desk).

Contexte actuel : l'équipe travaille pour le spatial et la défense. Elle a quitté Jira 7.1.6 (Server) pour Tuleap, qui devient la source principale de toute migration vers Athena. Un prototype d'Athena existe ; cette spécification sert de cible pour le faire évoluer.

## Principes directeurs

Athena combine la rigueur structurelle de Tuleap et la fluidité de navigation de Jira, en imposant un socle commun que chaque projet étend sans le casser.

| Principe | Repris de | Ce qu'Athena change |
| --- | --- | --- |
| Le projet est l'unité de travail | Tuleap | Le projet a toujours la même structure de navigation, quels que soient les modules activés |
| Le tracker est un objet de premier rang | Tuleap | Chaque tracker dérive d'un **type** défini au niveau organisation (Exigence, Anomalie, Tâche, Test, Risque, Interface…) |
| Plusieurs vues sur les mêmes données | Jira | Les vues sont attachées au tracker et visibles dans la navigation, pas cachées derrière la recherche |
| Recherche et requêtes comme accès rapide | Jira (JQL) | Langage de requête doublé d'un constructeur visuel synchronisé |
| Traçabilité par liens croisés | Tuleap | Liens typés, règles de couverture et liens « suspects » quand l'amont change |
| Personnalisation | Tuleap (widgets), Jira (favoris, barre latérale) | Personnalisation encadrée : favoris et ordre libres, structure fixe |
| Workflow comme colonne vertébrale | Jira | Workflow dessiné et affiché dans l'en-tête du tracker |

Trois règles d'interface s'appliquent partout :

1. **Une seule génération d'interface.** Toutes les pages utilisent le même système de design ; aucune page « legacy » ne coexiste.
2. **Une terminologie figée.** Un glossaire d'organisation définit les termes canoniques (Projet, Tracker, Item, Vue, Lien) ; un projet peut afficher un alias, jamais renommer le concept.
3. **La même place pour la même chose.** Une action ou une information occupe toujours le même emplacement d'un écran à l'autre (création en haut à droite, filtres sous l'en-tête, détail dans le panneau de droite).

## Modèle de données et hiérarchie

Athena emboite cinq niveaux, de l'organisation à l'item ; le projet et le tracker portent la navigation, l'organisation porte la cohérence.

&#91;embedded content: modèle Athena · 5 niveaux, 3 objets rattachés\]

Le socle défini par l'organisation descend via le gabarit dans chaque projet ; les vues se rattachent au tracker et les liens relient des items de trackers différents, y compris entre projets d'un même portefeuille.

## Architecture de navigation

La navigation tient en quatre éléments fixes : une barre supérieure fine, un rail latéral contextuel, un fil d'Ariane et une palette de commandes. Ils ne changent pas d'emplacement d'un écran à l'autre.

&#91;embedded content: écran type Athena · vue Tracker avec panneau de détail\]

- **Barre supérieure** (globale, identique partout) : logo et retour à « Mon travail », champ de recherche ouvrant la palette `Ctrl+K`, bouton « + Créer » contextuel (pré-rempli avec le projet et le tracker courants), centre de notifications, profil.
- **Rail latéral** (repliable) : en haut, favoris et éléments récents ; dessous, le projet courant avec ses onglets fixes, et sous « Trackers » l'arborescence catégorie → tracker → vues partagées. L'utilisateur peut épingler et réordonner, pas déplacer les rubriques.
- **Fil d'Ariane** : toujours `Portefeuille › Projet › Tracker › Vue › Item`, chaque segment cliquable et doté d'un sélecteur pour passer à un frère (autre tracker, autre vue).
- **Palette de commandes** : point d'entrée unique pour naviguer et agir au clavier (détail dans la section Recherche).

Les URL reflètent la même structure (`/sat1/exigences/arbre-urd/SAT1-REQ-0042`) et sont stables, pour pouvoir citer un item ou une vue dans un document ou un courriel.

## Vue Projet

La vue Projet répond en un écran à trois questions : où en est le projet, quels trackers le composent, et qu'est-ce qui demande mon attention.

**En-tête (fixe)** : nom et code du projet (ex. `SAT1`), visibilité, phase en cours (ex. PDR, CDR), nombre de membres, indicateur de santé calculé (couverture, items bloqués, jalons en retard), bouton « + Créer » contextuel et menu ⚙ pour les administrateurs.

**Onglets du projet** (toujours dans cet ordre, masqués seulement si le module est désactivé) :

| Onglet | Contenu | Fonctionnalités clés |
| --- | --- | --- |
| Vue d'ensemble | Tableau de bord du projet | Généré par défaut à partir du gabarit (jamais vide) ; widgets éditables par les responsables |
| Trackers | Carte de tous les trackers groupés par catégorie | Compteurs par état, dernière activité, accès direct à la vue par défaut de chaque tracker |
| Planification | Jalons, versions, sprints, backlog | Backlog transverse aux trackers ; sprints optionnels ; jalons projet liés aux revues |
| Traçabilité | Graphe et matrice du projet | Taux de couverture par règle, liens suspects, analyse d'impact |
| Documents | Documents générés et fichiers | Documents vivants issus des trackers (vue Document), baselines signées, pièces jointes |
| Code et intégration | Dépôts, pipelines, merge requests | État des pipelines, MR liées aux items |
| Activité | Flux chronologique | Filtrable par tracker, par personne, par type d'événement |
| Membres | Personnes et rôles | Rôles prédéfinis, « voir en tant que » pour vérifier les droits |

**Carte des trackers.** Les trackers sont regroupés en quatre catégories fixes : Ingénierie (exigences, interfaces, conception), Développement (tâches, anomalies, évolutions), Vérification (cas de test, campagnes, non-conformités), Pilotage (risques, actions, décisions). Chaque carte affiche l'icône du type, le nombre d'items par état sous forme de barre empilée et le nombre d'items qui me sont assignés.

**Vue d'ensemble par défaut** : jalons à venir, items à traiter par moi, couverture de traçabilité, items bloqués, activité récente. Chaque widget est une vue enregistrée : un clic ouvre la vue complète correspondante.

## Vue Tracker

La vue Tracker est l'écran de travail principal : un en-tête qui décrit le tracker, une barre de vues en onglets, une barre de filtres, puis la vue elle-même avec un panneau de détail à droite.

**En-tête** : nom, type (ex. Exigence), préfixe des identifiants (ex. `SAT1-REQ`), mini-schéma du workflow cliquable, compteurs par état, bouton « + Nouvel item », menu Configurer (administrateurs).

**Barre de vues.** Chaque tracker propose les vues pertinentes pour son type ; l'administrateur choisit la vue par défaut.

| Vue | Usage | Types de tracker concernés |
| --- | --- | --- |
| Tableau | Grille éditable en ligne, colonnes choisies, tri, regroupement | Tous |
| Board | Colonnes = états du workflow, glisser-déposer = transition | Tâches, anomalies, actions |
| Arbre | Hiérarchie parent / enfant dépliable, numérotation de chapitres | Exigences, conception, interfaces |
| Document | Documents StrictDoc du tracker en lecture seule, avec les items Athena qui citent chaque exigence | Exigences, ICD, plans de test |
| Timeline | Diagramme de Gantt sur dates de début / fin et jalons | Tâches, livrables |
| Calendrier | Items par échéance | Actions, revues |
| Matrice | Croisement de ce tracker avec un autre via un type de lien | Exigences × tests, exigences × conception |

**Barre de filtres** : filtres rapides en puces (état, responsable, version, « assigné à moi »), bascule vers le mode requête AQL, recherche plein texte dans le tracker. Le constructeur visuel et la requête texte restent synchronisés.

**Vues enregistrées** : chaque combinaison vue + filtres + colonnes peut être enregistrée en personnelle, partagée avec le projet ou définie par défaut. Les vues partagées apparaissent sous le tracker dans la barre latérale.

**Panneau de détail (vue scindée)** : un clic sur un item l'ouvre à droite sans quitter la liste ; flèches haut / bas pour passer d'un item à l'autre ; bouton d'agrandissement vers la page complète.

**Actions de masse** : sélection multiple, modification de champ, transition, déplacement, ajout de lien, export. Toute action de masse affiche un aperçu et reste annulable.

**Import / export** : CSV, Excel, ReqIF pour les exigences, avec mapping de champs sauvegardé et rapport d'import.

**Performance** : affichage virtualisé sans limite artificielle du nombre d'items (pas de plafond comparable aux 5 000 work items d'un board Jira).

## Vue Item

Un item a la même mise en page dans tous les trackers : contenu à gauche, métadonnées à droite, relations en onglets dessous. Seuls les champs varient, jamais leur emplacement.

**Bandeau** : identifiant stable et lisible (`SAT1-REQ-0042`), titre éditable en place, état courant, boutons des transitions autorisées (pas de liste déroulante cachée), version de l'item, fil d'Ariane `Projet › Tracker › Item`.

**Colonne principale** : description en texte riche (tableaux, formules, schémas, images), critères d'acceptation ou méthode de vérification, pièces jointes.

**Colonne métadonnées** : champs du socle commun en haut (état, responsable, priorité, version cible, dates), puis champs spécifiques du type regroupés en sections repliables (ex. pour une exigence : niveau, méthode de vérification IADT, criticité, source).

**Onglets du bas** :

| Onglet | Contenu |
| --- | --- |
| Liens | Liste typée (raffine, satisfait, vérifie, implémente, bloque, duplique) + mini-graphe à 1 ou 2 niveaux ; liens suspects signalés ; exigences StrictDoc citables comme un item |
| Code | Commits, branches et merge requests qui citent l'item, statut des pipelines |
| Tests | Cas de test liés, derniers résultats d'exécution par campagne |
| Discussion | Commentaires filés, mentions, résolution de fil |
| Historique | Modifications champ par champ avec diff, transitions, baselines contenant l'item |

**Versionnement** : chaque modification d'un champ de contenu crée une version ; on compare deux versions côte à côte ; une baseline fige l'état d'un ensemble d'items à une date (ex. livraison de l'URD en revue).

**Raccourcis clavier** : `E` éditer, `C` commenter, `L` lier, `T` transition, `J` / `K` item suivant / précédent, `Ctrl+K` palette de commandes.

## Recherche, requêtes et tableaux de bord

Trois moyens d'accès se complètent : la palette de commandes pour aller vite, le langage de requête pour filtrer finement, les tableaux de bord pour suivre dans la durée.

**Palette de commandes (`Ctrl+K`)** : recherche unifiée sur projets, trackers, vues, items (par identifiant ou texte) et actions (« créer une anomalie dans SAT1 », « aller à la matrice exigences × tests »). Les résultats récents et favoris apparaissent avant toute saisie.

**AQL (Athena Query Language)** : syntaxe inspirée de JQL, avec auto-complétion sur les champs du socle commun et des types.

```
projet = SAT1 AND type = Exigence AND etat != Validée
  AND NOT lien(vérifie) ORDER BY priorite DESC
```

Les fonctions de lien (`lien()`, `suspect()`, `couvert_par()`) permettent d'interroger la traçabilité directement : par exemple, toutes les exigences sans test.

**Vues transverses** : une vue enregistrée peut couvrir plusieurs trackers ou plusieurs projets du même portefeuille, grâce au socle commun de champs. Elles se rangent sous « Mes vues » ou dans le portefeuille.

**Tableaux de bord** :

| Niveau | Visibilité | Contenu par défaut |
| --- | --- | --- |
| Mon travail (personnel) | Moi seul | Assigné à moi, à relire ou approuver, mentions, items suivis, échéances de la semaine |
| Projet | Membres du projet | Jalons, santé, couverture, items bloqués, activité |
| Portefeuille | Responsables de programme | Santé comparée des projets, jalons consolidés, risques majeurs |

Chaque widget est construit sur une vue enregistrée : il n'existe pas de widget « opaque » dont on ne retrouve pas la source. Les widgets se déplacent, se replient et se dupliquent ; un tableau de bord se partage par lien et s'exporte en PDF pour une revue.

## Traçabilité et intégrations

La traçabilité est native : les liens sont typés, bidirectionnels, contrôlés par des règles, et alimentent automatiquement des indicateurs de couverture.

**Liens typés** : chaque type de lien a un sens et un libellé inverse (raffine / est raffiné par, vérifie / est vérifié par). L'organisation définit quels types de tracker un lien peut relier, ce qui évite les liens incohérents.

**Règles de couverture** : définies au niveau organisation ou projet, par exemple :

- Toute exigence logicielle validée doit être vérifiée par au moins un cas de test.
- Toute exigence de niveau 2 doit raffiner une exigence de niveau 1.
- Toute anomalie critique doit être liée à une version de correction.

Le taux de respect de chaque règle s'affiche dans l'onglet Traçabilité et dans les tableaux de bord.

**Liens suspects et analyse d'impact** : quand un item amont change de contenu, ses liens aval passent à l'état « suspect » jusqu'à revue. L'analyse d'impact affiche l'ensemble des items atteints à N niveaux avant de valider une modification.

**Matrice et graphe** : la matrice croise deux trackers via un type de lien, avec cases vides mises en évidence ; le graphe navigable part d'un item ou d'une baseline.

**Intégrations de développement** :

| Intégration | Comportement |
| --- | --- |
| Git (GitLab, GitHub) | Un identifiant cité dans un commit, une branche ou une MR (`SAT1-TSK-0108`) crée un lien ; option de transition automatique à la fusion |
| Intégration continue | Statut du dernier pipeline affiché sur l'item et dans la vue Code |
| Résultats de tests | Import JUnit / xUnit rattaché aux cas de test, mise à jour des campagnes |
| Analyse qualité | Indicateurs par version (couverture de code, défauts) affichables en widget |
| Authentification | SSO OIDC / SAML, groupes synchronisés avec les rôles |

Toutes ces intégrations passent par une API REST publique et des webhooks, documentés et utilisables pour des outils maison.

## Administration et gouvernance de configuration

La configuration suit trois niveaux hérités : l'organisation définit le socle, le gabarit l'assemble, le projet l'étend dans des limites tracées.

| Niveau | Qui | Ce qu'il définit | Ce qu'il ne peut pas faire |
| --- | --- | --- | --- |
| Organisation | Administrateurs Athena | Glossaire, types de tracker, champs du socle, workflows de référence, types de liens, règles de couverture, rôles | — |
| Gabarit de projet | Responsables méthodes / qualité | Jeu de trackers, vues et tableaux de bord par défaut, règles actives (ex. gabarit « Logiciel de vol ECSS ») | Supprimer un champ du socle |
| Projet | Administrateurs du projet | Champs supplémentaires, états supplémentaires dans un workflow, vues partagées, membres | Renommer un concept, retirer un champ ou un état du socle |

**Assistant de configuration** : chaque écran d'administration montre un aperçu en direct du formulaire d'item, du board et du workflow. Le workflow se dessine à la souris (états, transitions, conditions, validateurs).

**Configuration versionnée** : toute modification est historisée et exportable en YAML ; on compare deux versions, on annule, et on teste une configuration dans un projet bac à sable avant de la publier.

**Indicateur de dérive** : chaque projet affiche son écart au gabarit (champs ajoutés, états ajoutés) ; un administrateur d'organisation peut proposer de remonter un ajout récurrent dans le gabarit.

**Permissions** : rôles prédéfinis (Lecteur, Contributeur, Responsable, Administrateur de projet) et matrice lisible rôle × tracker × action ; permissions au niveau champ réservées aux cas justifiés ; fonction « voir en tant que » pour contrôler l'effet d'un rôle.

## Gabarits normatifs

Athena livre deux gabarits normatifs prêts à l'emploi, **Spatial** (ECSS) et **Défense** (OTAN AQAP), et un éditeur pour en créer d'autres par héritage. Un gabarit n'est pas simplement copié à la création : le projet reste rattaché à une version du gabarit et peut monter de version.

**Contenu d'un gabarit normatif**

| Composant | Rôle |
| --- | --- |
| Référentiel | Normes appliquées et leur édition ; clauses importées comme items d'un tracker « Exigences normatives » |
| Catégories de criticité | Niveaux qui conditionnent le tailoring, les règles et les livrables |
| Tailoring | Pour chaque clause et chaque catégorie : applicable, non applicable ou modifiée, avec justification |
| Trackers, champs, workflows | Trackers typés et champs propres au référentiel |
| Phases et revues | Jalons du cycle de vie avec critères d'entrée et de sortie |
| Livrables | Documents attendus par revue, rédigés dans StrictDoc et référencés depuis Athena |
| Règles | Couverture de traçabilité et conformité, seuils par catégorie |
| Marquage et accès | Mentions de protection, contrôle export, listes d'ayants droit |

**Référentiels retenus**

- Spatial : [ECSS-E-ST-40C Rev.1](https://ecss.nl/standard/ecss-e-st-40c-rev-1-software-30-april-2025) (30 avril 2025, ingénierie logicielle, remplace l'édition de 2009) et [ECSS-Q-ST-80C Rev.2](https://learn.adacore.com/booklets/adacore-technologies-for-space-systems-software/chapters/introduction.html) (assurance produit logiciel). Les révisions 2025 traitent explicitement la sécurité et ajoutent un dossier Sécurité aux livrables.
- Défense : [AQAP-2110](https://www.bundeswehr.de/en/organization/equipment/contract-award/quality-management/aqap-quality-assurance-requirements-nato) (qualité en conception, développement et production) complété par [AQAP-2210 éd. B v1](https://www.bundeswehr.de/resource/blob/133168/6302e491fe817463fda210d35dba5570/aqap-2210-2022-eng-data.pdf) (août 2022, supplément logiciel orienté projet), plus les exigences contractuelles propres à chaque programme.

**Comparatif des deux gabarits**

| Élément | Spatial (ECSS) | Défense (AQAP) |
| --- | --- | --- |
| Criticité | Catégories logicielles A à D (ECSS-Q-ST-80C) | Niveau paramétrable selon le programme (ex. DAL DO-178C pour un logiciel aéroporté) |
| Revues | SRR, PDR, CDR, QR, AR ; TRR / TRB pour les essais | Revues contractuelles du programme (SRR, PDR, CDR, qualification, recette), paramétrables |
| Dossiers et livrables | RB, TS, DDF, DJF, MGT, PAF, MF, OP, dossier Sécurité | Plan qualité (AQAP-2105), plan de développement logiciel, plan de gestion de configuration, dossiers de conception et de test |
| Trackers d'ingénierie | Exigences système (RB, IRD), exigences logicielles (SRS), interfaces (ICD), conception (SDD) | Exigences client (STB), exigences logicielles, interfaces, conception |
| Trackers de vérification | Spécifications et rapports de validation et vérification, campagnes | Cas de test, procédures et PV de recette, campagnes |
| Trackers d'écarts | SPR (anomalies), NCR, demandes de modification, RFD / RFW | Faits techniques, demandes de modification, dérogations et concessions |
| Trackers de revue | RID avec workflow dédié (ouvert → réponse → décision → action → clos) | Remarques de revue et actions issues des points clés |
| Champs spécifiques | Catégorie A–D, méthode de vérification (T, A, R, I), revue d'introduction | Mention de protection, contrôle export, article de configuration, niveau de criticité |
| Règles par défaut | Toute exigence logicielle tracée vers la RB et vérifiée ; RID clos avant clôture de revue | Toute exigence client tracée et vérifiée ; tout fait technique rattaché à un article de configuration |

Les seuils de couverture de code par catégorie sont à fixer avec l'assurance produit avant de figer le gabarit Spatial.

**Spécificités Défense (utiles aussi au spatial)**

- Mention de protection sur chaque item, document et export (ex. Diffusion Restreinte), reportée en en-tête et pied de page des documents générés, et signalée sur les items liés.
- Accès « besoin d'en connaître » : listes d'ayants droit par projet ou par tracker, en plus des rôles.
- Marquage de contrôle export (ITAR / EAR, biens à double usage) avec restriction d'accès associée.
- Rôle « Assurance qualité étatique » : lecture et approbation sur les jalons et baselines.
- Piste d'audit inaltérable et exportable.

L'instance principale d'Athena ne traite que des données non protégées. Un projet défense dispose d'une instance distincte, servie sur le réseau DR par un système homologué ; les marquages s'y appliquent de la même façon.

**Créer un nouveau gabarit**

Les gabarits s'héritent : socle d'organisation → gabarit normatif (Spatial, Défense) → gabarit dérivé (ex. « Spatial — catégorie B », « Défense — DR et ITAR »). Un enfant peut ajouter des éléments, jamais retirer ce que son parent marque obligatoire.

L'éditeur guide la création en étapes :

1. Choisir le parent (socle, Spatial, Défense ou un dérivé).
2. Déclarer le référentiel (norme, édition, date) et importer ses clauses (CSV ou ReqIF).
3. Définir les catégories de criticité et la matrice de tailoring clause × catégorie.
4. Composer trackers, champs et workflows (hérités ou ajoutés), avec aperçu en direct.
5. Définir phases, revues et livrables, avec leurs modèles de documents.
6. Définir les règles de couverture et de conformité.
7. Définir marquages et politiques d'accès.
8. Tester dans un projet bac à sable, faire relire, puis publier une version.

**Cycle de vie d'un gabarit**

- Chaque gabarit est versionné (ex. Spatial v2.1) et publié après revue par le responsable méthodes.
- Chaque projet est épinglé à une version ; une montée de version affiche d'abord un rapport d'impact (champs ajoutés, états modifiés, items concernés).
- Export et import YAML pour partager un gabarit entre instances ou le placer en gestion de configuration.
- Matrice de conformité : chaque clause applicable est liée à un élément de preuve (procédure, document, item) ; le taux de conformité s'affiche dans le projet et s'exporte pour audit.

## Fonctionnalités transverses

Ces fonctions se comportent de la même façon dans tous les écrans.

| Domaine | Fonctionnalités |
| --- | --- |
| Notifications | Centre unifié dans la barre supérieure ; abonnement par item, vue ou tracker ; réglage par événement (transition, mention, lien suspect) ; résumé quotidien par courriel au lieu d'un courriel par modification |
| Collaboration | Mentions, commentaires filés avec résolution, commentaires ancrés sur un passage de la vue Document, édition simultanée signalée |
| Revue et approbation | Circuits de relecture sur un item ou une baseline, approbation nominative horodatée, piste d'audit consultable |
| Personnalisation | Favoris (projets, trackers, vues), ordre de la barre latérale, thème clair / sombre, densité d'affichage, langue FR / EN |
| Accessibilité | Conformité RGAA / WCAG 2.1 AA, navigation complète au clavier, contrastes vérifiés |
| Aide intégrée | Glossaire consultable depuis chaque terme, aide contextuelle par écran, aide-mémoire des raccourcis (`?`) |
| Ouverture | API REST complète, webhooks, export intégral des données et de la configuration |
| Migration | Import depuis Tuleap via son API REST (trackers, champs, liens, historique, documents Artidoc), reprise des archives Jira 7.1.6 via l'API REST v2 ou l'export XML |

## Points faibles corrigés

Chaque défaut relevé dans l'analyse de Tuleap et de Jira a une réponse explicite dans Athena.

L'équipe utilisait Jira 7.1.6 (Server), antérieur à la navigation Cloud analysée : les lignes sur la terminologie, la refonte de navigation et le plafond de 5 000 items concernent Jira Cloud, mais décrivent des risques qu'Athena doit éviter.

| Outil | Point faible | Réponse Athena |
| --- | --- | --- |
| Tuleap | Trackers hétérogènes d'un projet à l'autre | Types de tracker et socle de champs définis par l'organisation ; mise en page d'item identique partout |
| Tuleap | Administration dense (champs, workflows, permissions imbriqués) | Assistant avec aperçu en direct, workflow dessiné, rôles prédéfinis, « voir en tant que » |
| Tuleap | Pages de générations différentes | Un seul système de design, aucune page legacy |
| Tuleap | Expérience dépendante des services activés | Onglets de projet fixes et ordonnés ; un module désactivé disparaît sans décaler le reste |
| Jira | Navigation remaniée à plusieurs reprises | Structure de navigation fixe ; seuls les favoris et l'ordre sont personnalisables |
| Jira | Ancienne et nouvelle interface coexistantes | Idem : un seul système de design |
| Jira | Terminologie mouvante (projects / spaces, issues / work items) | Glossaire figé ; alias d'affichage possibles, concepts inchangés |
| Jira | Deux modèles de projet (team-managed / company-managed) | Un seul modèle : héritage organisation → gabarit → projet |
| Jira | Boards absents de la navigation principale | Vues rattachées au tracker, visibles dans la barre latérale |
| Jira | Traçabilité exigences / tests dépendante d'extensions | Liens typés, règles de couverture, matrice et liens suspects natifs |
| Jira | Plafond de 5 000 items par board | Affichage virtualisé sans plafond artificiel |

## Priorisation proposée

Le prototype couvre déjà le socle technique, la fiche d'item et l'intégration GitLab (détail dans Écart prototype). La reprise commence donc par la navigation projet / tracker, puis la traçabilité et les gabarits normatifs.

| Lot | Travaux | S'appuie sur (prototype) | Critère de sortie |
| --- | --- | --- | --- |
| 1 — Navigation projet / tracker | Page d'accueil de projet à onglets fixes ; écran Tracker avec barre de vues (Tableau, Board) ; rail avec trackers et vues partagées ; fil d'Ariane ; URL par tracker et par vue ; panneau de détail scindé | Liste ATQL, boards, barre latérale, filtres enregistrés | Tout item atteint en moins de 3 actions sans écrire de requête |
| 2 — Traçabilité et vues d'ingénierie | Création de liens depuis la fiche ; types de liens au niveau organisation, autorisés par paire de trackers ; vues Arbre et Matrice ; règles de couverture ; fonctions de liens dans l'ATQL ; suspicion limitée aux champs de contenu | Liens typés, liens suspects, couverture StrictDoc | Matrice exigences × tests d'un projet pilote à jour |
| 3 — Gabarits normatifs | Référentiel, criticité, tailoring, revues, livrables et types de liens dans le modèle de gabarit ; version et rattachement du projet ; gabarits Spatial et Défense ; trackers RID et faits techniques | Gabarits de projet et de tracker, éditeurs de tracker et de workflow | Un projet créé depuis chaque gabarit ; montée de version testée |
| 4 — Marquage et accès Défense | Mention de protection, contrôle export, ayants droit, rôle Assurance qualité étatique, marquage des exports | Permissions par champ, audit chaîné, champs chiffrés par OpenBao | Instance DR déployable sans accès Internet (images, Keycloak et OpenBao locaux) ; validation par l'officier de sécurité |
| 5 — Documents StrictDoc dans Athena | Consultation en lecture seule des documents StrictDoc ; citation d'une exigence documentaire dans tout artefact (ex. action de sprint), signalée suspecte si l'exigence change ; baselines couplées aux versions des documents | Baselines Git, liaison StrictDoc | Une action de sprint cite une exigence de l'URD et signale sa modification |
| 6 — Migration | Import Tuleap complet par API REST (structure, liens, commentaires, pièces jointes, historique, Artidoc) ; archives Jira 7.1.6 ; import depuis l'interface | Import Jira CSV et Tuleap JSON, rapport d'import | Trois projets Tuleap migrés sans perte de liens |
| 7 — Collaboration et finitions | Notifications, abonnements, résumé par courriel, mentions, circuits d'approbation, thème sombre, corrections de l'audit d'interface | Commentaires, webhooks | Équipe pilote sans recours au courriel pour le suivi |

Décisions prises le 6 novembre 2026 :

- **Clés d'item** : format avec préfixe projet (SAT1-REQ-0042).
- **Documents d'exigences** : StrictDoc reste la source. Athena affiche les documents en lecture seule, et toute exigence d'un document peut être citée dans un artefact (par exemple une action de sprint).
- **Niveau de protection** : l'instance principale ne traite que des données non protégées. Un projet défense dispose d'une instance Athena distincte, servie sur le réseau DR par un système homologué.

Questions ouvertes :

- Le dépôt GitHub public est-il voulu ? Sinon, le passer en privé avant d'y verser des données de programme.
- Quels projets Tuleap migrer en premier, et faut-il reprendre l'historique Jira 7.1.6 ou seulement l'archiver en lecture ?
- Quels seuils de couverture par catégorie ECSS, et quels référentiels nationaux complètent AQAP pour les programmes défense ?
