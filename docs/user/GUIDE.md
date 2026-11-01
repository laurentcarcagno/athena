# Guide utilisateur d'Athena

## Principes
- Un **projet** contient plusieurs **trackers** (Bugs, Exigences, Stories…). Chaque tracker définit ses champs, ses statuts et son workflow.
- Un **artefact** est un élément d'un tracker. Sa clé (`BUG-142`) est unique dans le projet.
- Chaque modification est enregistrée dans l'historique (révision) et écrite dans GitLab sous votre nom.

## Navigation
- **Ctrl+K** (ou ⌘K) ouvre la palette de commandes : aller à un projet ou une page, chercher un artefact par clé ou titre.
- La barre latérale donne : Projets, Recherche, Tableau de bord, Administration (administrateurs).
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
Dans un message de commit, une merge request ou un nom de branche, citez la clé : `Fixes BUG-142`, `Refs BUG-142`, `Closes`, `Implements`, `Reverts`. La branche conseillée est `bugfix/BUG-142-resume`. Athena fait avancer l'artefact (démarrage, revue, résolution à la fusion) en respectant le workflow : un message de commit ne contourne jamais les droits ou les champs obligatoires.

## Boards, sprints, tableau de bord
- **Board** : colonnes liées aux statuts, limites WIP. Glisser une carte, ou utiliser « Déplacer vers » au clavier. Le déplacement suit les transitions du workflow.
- **Sprint** : planifié → actif → clos. À la clôture, ce qui n'est pas terminé retourne au backlog. Vélocité, burndown et prévision se calculent seuls.
- **Tableau de bord** : indicateurs, flux des 7 derniers jours, vélocité, roadmap par release, activité récente.

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
