# Guide utilisateur d'Athena

## Principes
- Un **projet** contient plusieurs **trackers** (Bugs, Exigences, Stories…). Chaque tracker définit ses champs, ses statuts et son workflow.
- Un **ticket** est un élément d'un tracker. Sa clé (`SAT1-BUG-0142`, soit projet, tracker et numéro sur 4 chiffres au moins) est unique dans toute l'organisation et ne change jamais. Les anciennes clés (`BUG-142`) restent valables : elles ouvrent le même ticket dans leur projet, et l'adresse affichée devient celle de la nouvelle clé.
- Chaque modification est enregistrée dans l'historique (révision) et écrite dans GitLab sous votre nom.

## Navigation
- **Ctrl+K** (ou ⌘K) ouvre la palette de commandes : aller à un projet ou une page, chercher un ticket par clé ou titre.
- La barre latérale (le **rail**) porte le nom ATHENA. Ses menus **Favoris** et **Récents** s'ouvrent sur le côté d'un clic (les favoris se réordonnent avec ↑ ↓) ; puis viennent **Projets**, **Mon travail**, **Recherche** et **Administration** (administrateur), au plus six entrées en tout. Dans un projet, le rail ajoute la rubrique du projet : Vue d'ensemble, Backlog, Board, Trackers (avec la liste des trackers), Roadmap, Rapports, Documents, Recherche et Paramètres. En bas : vos initiales, une icône de rôle, le thème, la langue, le **Profil**, l'**Aide** et la déconnexion. Le bouton « » replie le rail. L'**étoile** de l'en-tête d'un projet, d'un tracker ou d'un ticket l'ajoute aux favoris.
- Les sections du projet sont dans le rail, dans un ordre fixe : **Vue d'ensemble**, **Backlog** (tickets des trackers de type Tâche, sprints, burndown), **Board**, **Trackers**, **Planning** (diagramme de Gantt en lecture : tâches en hiérarchie, barres avec avancement, jalons, liens « précède », jours non ouvrés du calendrier de l'organisation ; onglet **Versions** : versions et avancement ; l'ancienne adresse `/roadmap` y mène). Dans le Planning, sélectionnez une tâche (clic sur son titre ou sa barre) : le chef de projet la lie à une autre (« Lier à… », décalage modifiable) ; un utilisateur demande un décalage de sa tâche, ce qui ajoute un commentaire au ticket qui mentionne les chefs du projet, **Rapports** (Avancement, Traçabilité, Conformité, Livraison, Activité), **Documents**, **Recherche** et **Paramètres** (Membres, Trackers, Boards, Automatisations, Baselines, Approbations ; réservés aux administrateurs, chefs de projet et assurance qualité selon la section). Une section ou un rapport dont le module n'est pas actif (pas de dépôt de code, pas de source documentaire, pas de type de lien) est masqué, sans déplacer les autres. Sur mobile, un sélecteur de section remplace le rail et une barre basse propose Mon travail, Projets, Chercher et Menu.
- **Menus du rail.** **Projets**, **Favoris** et **Récents** sont des menus latéraux. Projets ouvre la liste de vos projets (identifiant puis nom), précédée, pour un administrateur, de **Nouveau projet** (création d'un projet) et suivie de **Tous les projets** (la page des projets). Favoris et Récents montrent, après l'identifiant (projet, tracker, ticket), son titre en clair.
- **Trackers au rail.** Au-delà de cinq trackers, ils se regroupent par métier (Exigences et conception, Développement, Vérification et qualité, Gestion), groupes repliés ; celui du tracker ouvert est déplié. Le nom s'affiche sans son code. L'entrée **Chercher dans le projet** se distingue de la **Recherche** de toute l'organisation. L'assurance produit, qui n'a que les approbations dans les Paramètres, voit l'entrée **Approbations**.
- **Créer** (touche **N**, palette de commandes « Créer un ticket… », ou « + Nouveau ticket » d’un tracker) crée un ticket dans le contexte de la page (projet ou tracker) sans quitter la page ; le message « Ouvrir » mène au ticket.
- Le **Profil** (icône du bas du rail, adresse `/profil`) regroupe la langue, le thème, la page d'accueil (Mon travail ou Projets) et les notifications. Langue, thème et page d'accueil sont enregistrés sur votre compte : ils vous suivent d'un navigateur à l'autre (comme dans JIRA et Tuleap). `/notifications` liste toutes vos notifications.

## Projets et Mon travail
- **Projets** (`/projets`) liste dans un tableau les projets auxquels vous avez accès. L'icône ▸ d'une ligne déplie les trackers du projet (un seul projet : déplié d'office) ; cliquer sur le nom d'un tracker ouvre son écran, cliquer sur le nom d'un projet l'ouvre. Les administrateurs ont le bouton **Nouveau projet** (vers l'Administration).
- **Mon travail** (`/`, page d'accueil par défaut) est votre **tableau de bord personnel** : Mes tickets, À approuver, Mentions, Échéances de la semaine, Projets favoris et Récents. **Personnaliser** permet de monter, descendre, masquer ou dupliquer un widget, d'ajouter un widget fondé sur l'une de vos recherches enregistrées (ou un widget masqué) et de **Réinitialiser** la disposition par défaut ; chaque widget mène à sa liste complète dans la Recherche. En dessous, « À prendre » liste les tickets libres. La Vue d'ensemble de chaque projet fonctionne de même, limitée au projet.
- **À approuver** liste les tickets dont l'étape courante d'un circuit d'approbation vous désigne (vous ou votre rôle) ; l'assurance qualité y voit aussi les jalons et baselines en attente. **Échéances de la semaine** repose sur la requête `assignee = currentUser() AND category != done AND due <= daysFromNow(7)` : elle suppose que le champ d'échéance du tracker s'appelle `due` (clé du gabarit standard). Pour un tracker dont l'échéance porte une autre clé, **dupliquez** le widget (Personnaliser) et adaptez la requête dans la Recherche, puis ajoutez-la comme vue enregistrée.
- **Tableau de bord modulaire (lot 13).** Les cartes se posent sur une grille de 12 colonnes. **Organiser** ouvre un brouillon : glissez une carte par sa poignée ⠿ (au clavier : Entrée pour la saisir, flèches pour la déplacer d'une case, Entrée ou Échap pour la poser), réglez-la avec **Réglages** (titre, projet, largeur, hauteur, période), retirez-la avec **Masquer**, ajoutez-en depuis le **Catalogue** (un même genre peut être posé plusieurs fois, pour des projets différents). Rien n'est enregistré avant **Enregistrer** ; **Annuler** restaure ; **Rétablir la disposition par défaut** revient au réglage du rôle. Le catalogue dépend de votre rôle : les cartes de pilotage (Informations générales, Avancement global, Indicateurs clés, Santé du projet, Progression du sprint) sont réservées aux chefs de projet et aux administrateurs ; Pipelines CI/CD, Qualité du code et Badges sont ouverts à tous. Sur téléphone, les cartes passent sur une colonne dans l'ordre de lecture. Une carte sans donnée affiche un état vide avec l'action utile (par exemple « Relier un dépôt »). La qualité du code reste « non reliée » tant que SonarQube n'est pas branché (lot 14).
- **Thèmes.** « Athena arrondi » (angles de 8 px) et « GitHub » (clair et sombre) s'ajoutent aux autres thèmes dans le Profil.
- **Accueil selon le rôle.** Sans réglage, le chef de projet ouvre sur les tâches en retard, le chemin critique et les risques ouverts ; l'utilisateur sur ses tâches en retard ; l'assurance produit sur ses visas, ses mentions, les non-conformités et les actions (RID) ouvertes. Chacun réorganise ou ajoute ces cartes (Organiser).
- Les boutons d'action fréquents (rechercher, page précédente ou suivante, fermer, nouveau ticket) sont des icônes : l'info-bulle, au survol, donne leur rôle. La Recherche regroupe ses résultats par tracker quand elle en mélange plusieurs.
- **Aide** affiche ce guide, les raccourcis, des exemples ATQL et les rôles.

## Rechercher : le langage ATQL

Champs de planning : `type` (type du tracker : `requirement`, `task`, `bug`, `risk`…), `startDate` et `dueDate` (dates du ticket, quel que soit le nom du champ) ; fonctions `late()` (échéance dépassée, ticket non terminé) et `critical()` (chemin critique du planning).
```
status = open AND severity IN (majeure, bloquante) ORDER BY updated DESC
assignee IS EMPTY
title ~ "démarrage"
created > "2026-01-01" AND tracker = BUG
points > 5 AND NOT (tags = ui)
created_by = currentUser()
```
Champs natifs : `key`, `tracker`, `status`, `project`, `created_by`, `created`, `updated`. Tous les autres sont les champs du tracker. Opérateurs : `= != ~ < > <= >=`, `IN`, `NOT IN`, `IS [NOT] EMPTY`, `AND`, `OR`, `NOT`, parenthèses. Cliquer sur un en-tête de colonne trie les résultats.

**Traçabilité dans la requête** : `suspect()` (tickets ayant un lien suspect, à l'une ou l'autre extrémité), `linkedTo(ARI-REQ-0001)` ou `linkedTo(ARI-REQ-0001, "verifies")` (tickets liés à celui-là, dans les deux sens, éventuellement par ce type de lien), `notLinked("verifies")` (tickets sans lien de ce type) et `notLinked()` (sans aucun lien). Elles se combinent avec le reste : `tracker = REQ AND notLinked("verifies")` donne les exigences sans vérification. La case « Liens suspects » de la barre de filtres du tracker écrit `suspect()`.

## Travailler sur un ticket
- **Personnes** : le champ **Responsable** (et tout champ de type personne) affiche le nom de la personne, en lecture seule ; on le change par **M'assigner** ou à la création. L'historique affiche aussi les noms, pas les identifiants de compte.
- **Détails** : modifier un champ puis quitter la zone enregistre. Si quelqu'un a modifié le ticket entre-temps, un message l'indique et la fiche se recharge.
- **Transitions** : les boutons en haut appliquent le workflow. Un message précise ce qui manque (champ obligatoire, rôle requis).
- **Liens** : liens vers d'autres tickets et exigences de documentation. Un lien **suspect** signale que l'élément lié a changé depuis la liaison : relisez-le puis acquittez.
- **Historique** : qui a changé quoi, quand, et le commit GitLab correspondant. **Restaurer** recrée les valeurs d'une ancienne révision par une nouvelle révision (rien n'est effacé).
- **Développement** : branches, commits, merge requests et état des pipelines liés au ticket.

## Lier des tickets entre eux
Dans l'onglet **Liens** d'une fiche (raccourci **L**, qui place le focus sur la création), choisissez le type de lien dans le sens voulu (« vérifie » ou « est vérifié par »), tapez la clé ou un mot du titre du ticket cible, choisissez-le dans la liste proposée puis **Lier**. Chaque ligne permet de **supprimer** le lien (avec confirmation, il disparaît des deux côtés) ; un lien **suspect** (la cible a changé depuis la dernière revue) s'**acquitte** en un clic une fois la vérification faite.

### Types de liens
Les administrateurs gèrent les **types de liens** de l'organisation dans Organisation > Liens : raffine, satisfait, vérifie, implémente, bloque, duplique sont livrés (modifiables et réinitialisables) et l'on peut en créer. Un type est utilisable dans tous les projets ; un type de projet de même clé le surcharge dans son projet. Un type peut déclarer des **paires de types de tracker** (par exemple « vérifie » : Cas de test → Exigence) : le lien est alors refusé entre d'autres types, dans le sens inverse, et le message nomme les paires autorisées. Un type sans paire relie n'importe quels trackers, et un tracker sans type n'est jamais contraint.

### Liens suspects
Un lien devient **suspect** quand la **cible** change au point de remettre en cause ce qui a été vérifié. Seule la modification d'un **champ de contenu** le provoque : dans l'éditeur de tracker et dans sa page de configuration, chaque champ a une case « Champ de contenu » (cochée par défaut ; décochez la priorité, le responsable, les dates, les versions). Un changement d'état ne rend jamais un lien suspect. Chaque type de lien règle en outre s'il **propage la suspicion** (Organisation > Liens ; « bloque » ne la propage pas par défaut). Une personne acquitte le lien depuis la fiche une fois la vérification faite.

## Lier le code
Dans un message de commit, une merge request ou un nom de branche, citez la clé : `Fixes SAT1-BUG-0142`, `Refs SAT1-BUG-0142`, `Closes`, `Implements`, `Reverts`. La branche conseillée est `bugfix/SAT1-BUG-0142-resume`. Les anciennes clés (`Fixes BUG-142`) sont encore reconnues dans le projet concerné. Athena fait avancer le ticket (démarrage, revue, résolution à la fusion) en respectant le workflow : un message de commit ne contourne jamais les droits ou les champs obligatoires.

## Boards, sprints, tableau de bord
- **Board** : colonnes liées aux statuts, limites WIP. Glisser une carte, ou utiliser « Déplacer vers » au clavier. Le déplacement suit les transitions du workflow.
- **Sprint** : planifié → actif → clos. À la clôture, ce qui n'est pas terminé retourne au backlog. Vélocité, burndown et prévision se calculent seuls.
- **Rapports › Risques** (si le projet a un tracker de type risque) : les risques du plus critique au moins critique, avec palier en toutes lettres.
- **Rapports › Avancement** : indicateurs, flux des 7 derniers jours, vélocité, roadmap par version, activité récente.

## Vue projet, workflow et gabarits
- **Vue projet** (page **Projets**) : chaque tracker occupe une ligne avec son nom, le nombre d'tickets créés et la liste de ses attributs (champs).
- **Workflow** : dans la configuration d'un tracker, la carte **Workflow** dessine la machine à états (une colonne par catégorie de statut, une flèche par transition ; les flèches en pointillés partent de « Tout état »). Un administrateur crée une transition en cliquant le statut de départ puis le statut d'arrivée, puis nomme la transition et, au besoin, limite ses rôles. Les nœuds se manipulent aussi au clavier (`Tab`, `Entrée`).
- **Disposition de la vue détails** : à la création d'un tracker (et plus tard dans sa configuration), la carte **Disposition de la vue détails** règle l'affichage de la fiche d'un ticket. Par défaut elle est **automatique**. **Personnaliser** ouvre un aperçu fidèle en grille de 3 colonnes : glissez un attribut pour le déplacer, ou utilisez ses boutons (reculer, avancer, largeur 1/3, 2/3 ou 3/3, déplacer vers une section, retirer). Les sections ont un titre. Un attribut non placé reste affiché à la suite des autres. **Revenir à l'automatique** annule la personnalisation. La disposition est copiée avec le tracker dans les gabarits.
- **Gabarits de tracker** (administrateurs, **Administration > Gabarits > Gabarits de tracker**) : un gabarit décrit un tracker complet (champs, statuts, workflow). Trois sont livrés (Bugs, Exigences, Tâches). On en crée un de toutes pièces avec l'éditeur de tracker (champs avec options, statuts, workflow graphique), ou en partant d'un gabarit existant que l'on modifie. **Tous les gabarits sont modifiables**, y compris les gabarits livrés : **Modifier** ouvre l'éditeur ; **Réinitialiser** rétablit la version d'origine d'un gabarit livré.
- **Créer un tracker** : dans **Paramètres › Trackers** du projet, le bouton **Nouveau tracker** (administrateurs) ouvre l'éditeur ; on peut y partir d'un gabarit de tracker, le modifier librement, puis créer le tracker dans le projet.
- **Gabarits de projet** (**Administration > Gabarits > Gabarits de projet**) : un gabarit regroupe plusieurs trackers, choisis parmi les gabarits de tracker, repris d'un projet existant, ou créés à la volée par **Nouveau tracker pour ce gabarit** (qui enregistre aussi un gabarit de tracker réutilisable). Trois gabarits sont livrés (Projet vide, Suivi de bugs, Qualité). **Modifier** permet de renommer un gabarit, de retirer ou d'éditer ses trackers et d'en ajouter depuis un gabarit de tracker.

### Types de tracker
Un **type de tracker** (Exigence, Interface, Conception, Tâche, Anomalie, Évolution, Cas de test, Campagne, Non-conformité, Risque, Action, Décision, Revue) est défini pour toute l'organisation. Il fixe la catégorie (Ingénierie, Développement, Vérification, Pilotage), les vues proposées et un socle de champs. Les administrateurs les gèrent dans Organisation > Types : les types livrés se modifient et se réinitialisent, et l'on peut en créer d'autres. À la création d'un tracker, choisir un type ajoute son socle de champs (les champs déjà présents sont conservés) ; la page de configuration d'un tracker permet de le rattacher à un type plus tard ou de le détacher. Un tracker sans type reste valide et classé « Autres ».

## Gabarits normatifs

Athena livre deux gabarits prêts à l'emploi, **Spatial (ECSS)** et **Défense (AQAP)**. Un projet créé depuis un gabarit reste rattaché à une **version** de ce gabarit (par exemple Spatial 1.1) : il reçoit ses trackers, ses workflows, ses phases et ses règles de couverture, et il choisit sa **catégorie de criticité** à la création.

- **Spatial** : ECSS-E-ST-40C Rev.1 et ECSS-Q-ST-80C Rev.2, catégories A à D, revues SRR, PDR, CDR, QR et AR, trackers d'exigences système et logicielles, interfaces, conception, vérification, SPR, NCR, demandes de modification, RFD/RFW et RID (ouvert, réponse, décision, action, clos).
- **Défense** : AQAP-2110 et AQAP-2210 éd. B, exigences client, faits techniques, dérogations et concessions, remarques de revue, articles de configuration. Les revues et les niveaux de criticité se paramètrent par programme. Chaque tracker porte les champs *mention de protection* et *contrôle export* (sans effet tant que l'instance Défense n'est pas en place).

Une phase se termine par une revue : on ne passe à la phase suivante que si ses critères de sortie sont remplis (par exemple tous les RID de la revue sont clos).

**Créer un gabarit dérivé** (par exemple « Spatial — catégorie B ») : on choisit un parent publié, on ajoute des trackers, des revues, des livrables ou des règles. Un dérivé ne peut ni retirer ni renommer un élément que son parent déclare obligatoire ; la liste des éléments en cause est donnée en cas de refus. Un gabarit se publie : chaque version est figée et ne change plus. Il s'exporte et s'importe en YAML.

**Seuils** : les seuils de couverture de code par catégorie sont des paramètres du gabarit, vides par défaut. Le responsable méthodes les renseigne dans un gabarit dérivé ; ils sont versionnés avec lui.

**Monter de version** : un administrateur demande l'aperçu de la montée. Le rapport d'impact liste les champs et états ajoutés, renommés ou supprimés, les règles et les phases concernées, et le nombre de tickets touchés. Un état supprimé qui porte encore des tickets bloque la montée ; l'application passe par les évolutions de tracker habituelles (versionnées dans Git). Les ajouts propres au projet ne sont jamais supprimés : ils forment la **dérive** par rapport au gabarit.

**Conformité** : l'onglet *Conformité* apparaît quand le projet a un tracker d'exigences normatives (NORM). On y importe les clauses d'une norme depuis un CSV (référence, titre, texte), on indique pour chaque clause et chaque catégorie si elle est applicable, non applicable ou modifiée (avec justification), et on lie chaque clause applicable à une preuve. Le taux de conformité s'exporte en CSV pour un audit.

## Instance Défense : protection, besoin d'en connaître, contrôle export

**Niveau de protection.** Une instance a un niveau de protection (par exemple « Diffusion Restreinte »), réglé par l'administrateur à l'installation (`ATHENA_PROTECTION_LEVEL`). Un bandeau le rappelle en tête de chaque page, et la mention figure en en-tête et en pied de tous les exports (CSV, YAML, notes de version). Sans niveau, il n'y a ni bandeau ni mention.

**Besoin d'en connaître.** Dans l'onglet *Membres*, un administrateur ou un chef de projet crée la liste d'ayants droit d'un projet ou d'un tracker. Dès qu'une liste existe, seuls ses membres lisent la portée, administrateurs d'organisation compris ; la recherche, les compteurs, les tableaux de bord et les liens la respectent. Une liste garde toujours au moins un membre ; pour lever la restriction, on supprime la liste. Chaque changement est consigné dans le journal d'audit.

**Contrôle export.** Un responsable marque un ticket ITAR, EAR ou double usage depuis sa fiche. Le ticket n'est alors lisible que des ayants droit du contrôle export du projet (liste distincte, dans l'onglet *Membres*). Les tickets liés affichent seulement « lien vers un ticket sous contrôle export », sans titre ni contenu ; les webhooks sortants n'envoient ses événements qu'aux abonnements déclarés habilités.

**Assurance qualité.** Ce rôle a les droits d'un utilisateur dans le périmètre de sa liste d'ayants droit : il déclare des tickets (RID, anomalies, non-conformités), commente, lie et suit. Il n'est ni chef de projet ni administrateur : pas de configuration, de baseline, de planning ni de version. Il approuve ou refuse, sous son nom et avec horodatage, les jalons et les baselines pour lesquels un responsable a exigé une approbation (page *Planification*, onglet *Approbations*). Un jalon qui requiert une approbation ne peut pas être publié sans elle.

## Documents StrictDoc

L'onglet *Documents* (visible quand une source StrictDoc est indexée) permet de **lire** les documents du projet, par section, sans les modifier : la modification se fait dans StrictDoc, et une bannière le rappelle avec un lien vers la source. Chaque exigence a une adresse stable (`/p/<projet>/documents/<document>#<UID>`) ; la recherche accepte un UID (exact ou début) ou du texte. Les textes sont affichés comme du texte, sans HTML.

**Citer une exigence.** Dans l'onglet *Liens* de n'importe quel ticket (par exemple une action de sprint), le champ *Citer une exigence* propose les exigences par UID ou titre. Le document montre, sur chaque exigence, les tickets qui la citent, avec leur état. Quand l'exigence est modifiée dans StrictDoc puis ré-indexée, le lien de chaque ticket citant devient **suspect** (un événement `link.suspect` part aux webhooks) ; un humain l'acquitte pour faire de la nouvelle version la référence, et l'acquittement est audité.

**Baselines.** Une baseline enregistre le SHA de chaque source documentaire et l'empreinte de ses exigences. Elle est **refusée** si le dépôt documentaire a avancé depuis la dernière indexation : on ré-indexe d'abord, pour ne jamais figer des documents périmés sans le savoir. La page *Planification*, onglet *Baselines*, compare deux baselines (tickets, trackers, exigences ajoutées, modifiées, supprimées, SHA des documents) et exporte la comparaison en CSV, avec la mention de protection de l'instance si elle est définie.

## Notifications et abonnements
La cloche, au bas du rail à côté de l’icône de rôle, ouvre le **centre de notifications**. Le compteur indique les notifications non lues ; la liste s'ouvre au clavier (Entrée), **Échap** la referme.
- **Suivre** : le bouton « Suivre » d'un ticket, d'un tracker ou d'une vue enregistrée vous abonne. Celui qui crée ou commente un ticket le suit automatiquement ; « Ne plus suivre » annule.
- **Événements** : changement de statut, commentaire, lien devenu suspect, mention. Vous n'êtes jamais notifié de votre propre action.
- **Lu / non lu** : chaque notification se marque individuellement ; « Tout marquer comme lu » vide le compteur.
- **Réglages** : le bouton « Réglages » du centre active ou coupe chaque type d'événement.
- **Résumé quotidien** : dans « Réglages » du centre de notifications, activez le résumé et choisissez l'heure d'envoi (dans votre fuseau). Un seul courriel par jour regroupe vos notifications non lues, avec un lien vers chaque ticket. Si l'instance n'a pas de messagerie, l'option est signalée comme indisponible.
- **Mentions** : dans un commentaire, tapez `@` puis le début d'un nom ; la liste ne propose que les personnes qui peuvent lire le ticket (flèches, Entrée ou Tab pour choisir, Échap pour fermer). La personne mentionnée reçoit une notification « mention » (à la place de celle du commentaire) et retrouve le ticket dans la section **Mentions** de « Mon travail ». Une mention d'une personne sans accès au ticket est ignorée. Le texte du commentaire reste du texte : aucun HTML n'est interprété.
- **Droits** : une notification ne contient aucune valeur de champ et n'est produite que si vous pouvez lire le ticket (listes d'ayants droit, contrôle export). Si votre accès est retiré, elle disparaît de votre liste.

## Circuit d'approbation d'un ticket
Un responsable ou un administrateur définit un **circuit** sur un tracker (page de configuration du tracker, carte « Circuit d'approbation des tickets ») : des étapes ordonnées de relecture ou d'approbation, chacune confiée à des personnes nommées et/ou au rôle assurance qualité étatique, avec un nombre de décisions favorables requis.
- Sur l'ticket, l'onglet **Approbation** (présent quand le tracker a un circuit actif) dit l'état en texte, les étapes, qui est désigné et les décisions (nominatives, horodatées, commentées). Une étape s'ouvre quand la précédente est terminée ; seule une personne désignée à l'étape courante décide, après confirmation. Un refus arrête le circuit ; la personne peut revenir sur sa décision.
- **Toute modification du contenu du ticket invalide les décisions** : l'onglet l'indique (« Le ticket a été modifié… ») et le circuit reprend à la première étape. Un changement de statut ou de champ hors contenu (priorité, responsable) ne les invalide pas. Les décisions invalidées restent consultables dans le journal d'audit.
- Les personnes désignées sont averties quand leur étape s'ouvre ou qu'une décision est invalidée ; les abonnés du ticket le sont de chaque décision.
- Pour exiger le circuit avant une transition, ajoutez le validateur `{"type": "approval"}` à cette transition.
- Les jalons et baselines gardent leur approbation par l'assurance qualité étatique (Paramètres › Approbations) ; la table des décisions est la même.

## Thème clair, sombre ou système
Le bouton de thème (barre latérale, à côté du changement de langue) bascule dans l'ordre **système**, **clair**, **sombre** ; son libellé dit le réglage courant. « Système » suit la préférence de votre système d'exploitation ou de votre navigateur et change avec elle. Le réglage est mémorisé par navigateur (il ne suit pas votre compte). Les contrastes respectent WCAG 2.2 AA dans les deux thèmes.

## Fenêtres selon le rôle
- **Utilisateur** (`athena-user`) : **Mon travail** liste les tickets qui vous sont assignés (hors terminés) et ceux à prendre (non assignés, à faire) ; **Prendre** vous assigne le ticket.
- **Chef de projet** (`athena-pm`) : **Paramètres** du projet (`/p/<projet>/parametres`) : membres du projet (chef ou membre, choisis parmi les comptes déjà connectés), boards, baselines, approbations ; les sprints se planifient dans le **Backlog**, les versions dans la **Roadmap**. Un chef de projet ne gère que les projets dont il est désigné **chef**. Il configure aussi **les trackers et les automatisations** des projets dont il est responsable (Paramètres › Trackers, Automatisations) et **fige les baselines** ; le serveur vérifie qu'il est responsable du projet concerné.
- **Administrateur** (`athena-admin`) : **Administration** (`/admin`) : créer les projets, nommer ou retirer leurs chefs de projet, consulter les comptes, installer, activer et désinstaller les plugins, gérer les webhooks et les gabarits ; plus, dans chaque projet, les Paramètres › Trackers et Automatisations.

## Administrateurs
- **Configuration d'un tracker** (Paramètres › Trackers) : ajout de champs, de statuts et de transitions. Chaque modification incrémente la version du schéma et est versionnée dans Git (`tracker.yaml`). Pas de suppression ni de changement de type en v1.
- **Webhooks sortants** (Administration de l'organisation ; le secret n'est affiché qu'une fois), **automatisations** et **baselines** (Paramètres du projet), plugins (Administration).
- **Baselines** : tag Git figeant l'état du projet et les versions de la documentation liée ; comparables entre elles.
- **Import** : `POST /v1/projects/<P>/import` depuis JIRA (CSV) ou Tuleap (API REST). Toujours lancer d'abord la **simulation** (par défaut) et lire le rapport d'écarts.

## Automatisations
Règle « quand / si / alors » : déclencheur (création, modification, transition, commentaire, référence de code), condition en ATQL, actions (commentaire, transition, mise à jour). Elles s'exécutent avec le rôle minimal ; elles ne peuvent pas faire ce que le workflow interdit, et une garde empêche les boucles.

## Besoin d'aide
Raccourci **Ctrl+K**, puis tapez le nom de la page. L'administrateur de votre organisation gère les accès (groupes Keycloak).
