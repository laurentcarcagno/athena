# Guide utilisateur d'Athena

## Principes
- Un **projet** contient plusieurs **trackers** (Bugs, Exigences, Stories…). Chaque tracker définit ses champs, ses statuts et son workflow.
- Un **artefact** est un élément d'un tracker. Sa clé (`SAT1-BUG-0142`, soit projet, tracker et numéro sur 4 chiffres au moins) est unique dans toute l'organisation et ne change jamais. Les anciennes clés (`BUG-142`) restent valables : elles ouvrent le même artefact dans leur projet, et l'adresse affichée devient celle de la nouvelle clé.
- Chaque modification est enregistrée dans l'historique (révision) et écrite dans GitLab sous votre nom.

## Navigation
- **Ctrl+K** (ou ⌘K) ouvre la palette de commandes : aller à un projet ou une page, chercher un artefact par clé ou titre.
- La barre latérale donne : Projets, Mon travail, et pour le projet courant la Vue d'ensemble, la Recherche et l'Administration (administrateurs).
- Chaque projet s'ouvre sur une barre d'onglets à l'ordre fixe : Vue d'ensemble, Trackers, Planification, Traçabilité, Documents, Code et intégration, Activité, Membres. Un onglet dont le module n'est pas actif (pas de dépôt de code, pas de source documentaire, pas de type de lien) est masqué, sans déplacer les autres. La Recherche (requêtes ATQL) est une vue du projet, à l'adresse `/p/<projet>/recherche` ; les anciennes adresses (`/p/<projet>?q=…`, `/manage`, `/dashboard`) redirigent.
- Le bouton en haut change la langue (français / anglais).

## Rechercher : le langage ATQL
```
status = open AND severity IN (majeure, bloquante) ORDER BY updated DESC
assignee IS EMPTY
title ~ "démarrage"
created > "2026-01-01" AND tracker = BUG
points > 5 AND NOT (tags = ui)
created_by = currentUser()
```
Champs natifs : `key`, `tracker`, `status`, `project`, `created_by`, `created`, `updated`. Tous les autres sont les champs du tracker. Opérateurs : `= != ~ < > <= >=`, `IN`, `NOT IN`, `IS [NOT] EMPTY`, `AND`, `OR`, `NOT`, parenthèses. Cliquer sur un en-tête de colonne trie les résultats.

## Travailler sur un artefact
- **Détails** : modifier un champ puis quitter la zone enregistre. Si quelqu'un a modifié l'artefact entre-temps, un message l'indique et la fiche se recharge.
- **Transitions** : les boutons en haut appliquent le workflow. Un message précise ce qui manque (champ obligatoire, rôle requis).
- **Liens** : liens vers d'autres artefacts et exigences de documentation. Un lien **suspect** signale que l'élément lié a changé depuis la liaison : relisez-le puis acquittez.
- **Historique** : qui a changé quoi, quand, et le commit GitLab correspondant. **Restaurer** recrée les valeurs d'une ancienne révision par une nouvelle révision (rien n'est effacé).
- **Développement** : branches, commits, merge requests et état des pipelines liés à l'artefact.

## Lier le code
Dans un message de commit, une merge request ou un nom de branche, citez la clé : `Fixes SAT1-BUG-0142`, `Refs SAT1-BUG-0142`, `Closes`, `Implements`, `Reverts`. La branche conseillée est `bugfix/SAT1-BUG-0142-resume`. Les anciennes clés (`Fixes BUG-142`) sont encore reconnues dans le projet concerné. Athena fait avancer l'artefact (démarrage, revue, résolution à la fusion) en respectant le workflow : un message de commit ne contourne jamais les droits ou les champs obligatoires.

## Boards, sprints, tableau de bord
- **Board** : colonnes liées aux statuts, limites WIP. Glisser une carte, ou utiliser « Déplacer vers » au clavier. Le déplacement suit les transitions du workflow.
- **Sprint** : planifié → actif → clos. À la clôture, ce qui n'est pas terminé retourne au backlog. Vélocité, burndown et prévision se calculent seuls.
- **Tableau de bord** : indicateurs, flux des 7 derniers jours, vélocité, roadmap par release, activité récente.

## Vue projet, workflow et templates
- **Vue projet** (page **Projets**) : chaque tracker occupe une ligne avec son nom, le nombre d'artefacts créés et la liste de ses attributs (champs).
- **Workflow** : dans la configuration d'un tracker, la carte **Workflow** dessine la machine à états (une colonne par catégorie de statut, une flèche par transition ; les flèches en pointillés partent de « Tout état »). Un administrateur crée une transition en cliquant le statut de départ puis le statut d'arrivée, puis nomme la transition et, au besoin, limite ses rôles. Les nœuds se manipulent aussi au clavier (`Tab`, `Entrée`).
- **Disposition de la vue détails** : à la création d'un tracker (et plus tard dans sa configuration), la carte **Disposition de la vue détails** règle l'affichage de la fiche d'un artefact. Par défaut elle est **automatique**. **Personnaliser** ouvre un aperçu fidèle en grille de 3 colonnes : glissez un attribut pour le déplacer, ou utilisez ses boutons (reculer, avancer, largeur 1/3, 2/3 ou 3/3, déplacer vers une section, retirer). Les sections ont un titre. Un attribut non placé reste affiché à la suite des autres. **Revenir à l'automatique** annule la personnalisation. La disposition est copiée avec le tracker dans les templates.
- **Templates de tracker** (administrateurs, **Organisation > Templates > Templates de tracker**) : un template décrit un tracker complet (champs, statuts, workflow). Trois sont livrés (Bugs, Exigences, Tâches). On en crée un de toutes pièces avec l'éditeur de tracker (champs avec options, statuts, workflow graphique), ou en partant d'un template existant que l'on modifie. **Tous les templates sont modifiables**, y compris les templates livrés : **Modifier** ouvre l'éditeur, la modification d'un template livré le remplace pour votre organisation (étiquette **Modifié**) et **Réinitialiser** rétablit la version d'origine. Les projets déjà créés ne changent pas.
- **Créer un tracker** : sur la page **Projets**, le bouton **Ajouter un tracker** (administrateurs) ouvre l'éditeur ; on peut y partir d'un template de tracker, le modifier librement, puis créer le tracker dans le projet.
- **Templates de projet** (**Organisation > Templates > Templates de projet**) : un template regroupe plusieurs trackers, choisis parmi les templates de tracker, repris d'un projet existant, ou créés à la volée par **Nouveau tracker pour ce template** (qui enregistre aussi un template de tracker réutilisable). Trois templates sont livrés (Projet vide, Suivi de bugs, Qualité). **Modifier** permet de renommer un template, de retirer ou d'éditer ses trackers et d'en ajouter depuis un template de tracker ; cela vaut aussi pour les templates livrés (**Réinitialiser** les rétablit). À la création d'un projet, le **Template du projet** crée automatiquement ses trackers.

### Types de tracker
Un **type de tracker** (Exigence, Interface, Conception, Tâche, Anomalie, Évolution, Cas de test, Campagne, Non-conformité, Risque, Action, Décision, Revue) est défini pour toute l'organisation. Il fixe la catégorie (Ingénierie, Développement, Vérification, Pilotage), les vues proposées et un socle de champs. Les administrateurs les gèrent dans Organisation > Types : les types livrés se modifient et se réinitialisent, et l'on peut en créer d'autres. À la création d'un tracker, choisir un type ajoute son socle de champs (les champs déjà présents sont conservés) ; la page de configuration d'un tracker permet de le rattacher à un type plus tard ou de le détacher. Un tracker sans type reste valide et classé « Autres ».

## Fenêtres selon le rôle
- **Utilisateur** (`athena-user`) : **Mon travail** liste les artefacts qui vous sont assignés (hors terminés) et ceux à prendre (non assignés, à faire) ; **Prendre** vous assigne l'artefact.
- **Chef de projet** (`athena-pm`) : **Gestion de projet** (`/p/<projet>/manage`) : acteurs du projet (chef ou membre, choisis parmi les comptes déjà connectés), sprints (créer, démarrer, clore), versions (créer, publier), boards (créer). Un chef de projet ne gère que les projets dont il est désigné **chef**.
- **Administrateur** (`athena-admin`) : **Organisation** (`/org`) : créer les projets, nommer ou retirer leurs chefs de projet, consulter les comptes, installer, activer et désinstaller les plugins ; plus la configuration des trackers et l'**Administration** du projet.

## Administrateurs
- **Configuration d'un tracker** : ajout de champs, de statuts et de transitions. Chaque modification incrémente la version du schéma et est versionnée dans Git (`tracker.yaml`). Pas de suppression ni de changement de type en v1.
- **Administration** : webhooks sortants (le secret n'est affiché qu'une fois), automatisations, plugins, baselines.
- **Baselines** : tag Git figeant l'état du projet et les versions de la documentation liée ; comparables entre elles.
- **Import** : `POST /v1/projects/<P>/import` depuis JIRA (CSV) ou Tuleap (API REST). Toujours lancer d'abord la **simulation** (par défaut) et lire le rapport d'écarts.

## Automatisations
Règle « quand / si / alors » : déclencheur (création, modification, transition, commentaire, référence de code), condition en ATQL, actions (commentaire, transition, mise à jour). Elles s'exécutent avec le rôle minimal ; elles ne peuvent pas faire ce que le workflow interdit, et une garde empêche les boucles.

## Besoin d'aide
Raccourci **Ctrl+K**, puis tapez le nom de la page. L'administrateur de votre organisation gère les accès (groupes Keycloak).
