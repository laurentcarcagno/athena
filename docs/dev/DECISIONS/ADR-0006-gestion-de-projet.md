# ADR-0006 : gestion de projet (planning, risques, temps, finances)

Statut : accepté (2026-11-12). Plan d'exécution du premier lot : `docs/dev/tasks/LOT12-PLAN.md`. Maquette de référence : `docs/dev/maquettes/lot12-gestion-projet.html` (copie de la page de relecture ; avis et décisions du demandeur enregistrés le 2026-11-12).

## 1. Contexte

Le demandeur a fourni un cahier des charges de gestion de projet en cinq espaces : centre de contrôle (portefeuille), moteur de planification (Gantt), rigueur (risques et exigences), ressources et finances, collaboration. L'analyse d'impact (27 exigences) montre que 11 d'entre elles s'appuient déjà sur l'existant des lots 1 à 11 : cartes organisables (`DashCard`, Organiser, cartes graphiques), panneau de détail latéral, thème sombre, baselines Git couplées à StrictDoc, traçabilité avec suspicion, création contextuelle, automatisations « quand / si / alors », notifications et approbations. Il manque surtout ce qui repose sur le temps : date de début et durée, dépendances ordonnées, calendrier, temps saisis, capacité, coûts. Le Gantt figurait déjà dans les écarts mineurs de `STATE.md`.

Revue sur la page de relecture (maquettes cliquables par rôle) : les six sections validées sans réserve, les neuf décisions tranchées sur la recommandation.

## 2. Décisions

### 2.1 Décisions de la revue

| N° | Sujet | Décision |
| --- | --- | --- |
| D1 | Police | Celle du thème (IBM Plex Sans pour Athena) ; identifiants en IBM Plex Mono. Pas d'Inter. |
| D2 | Chemin critique | Jeton de danger (`state.danger.*`), trait plus épais et mention « Critique » dans le tableau. Jamais le rouge tricolore ; jamais la couleur seule. |
| D3 | Tâche parente | Durée et dates **calculées** depuis les enfants ; on modifie un enfant, le planning se recalcule. |
| D4 | Temps saisis | En base, avec audit ; **hors GitLab** (volume). |
| D5 | Taux journaliers | **Par profil** (ingénieur, expert…), pas par personne. |
| D6 | Spécifications | StrictDoc reste la source (plan § 16.2) ; Athena cite. Pas d'éditeur par blocs (plan § 1.2). Plans de mitigation en Markdown dans le ticket Risque. |
| D7 | Chronomètre | Dans la barre haute. |
| D8 | Navigation | Les 8 sections du projet (ADR-0003) sont gardées ; **Roadmap devient Planning** (vues Gantt, Board, Liste, Versions). |
| D9 | Ordre des lots | Planning (12), Pilotage et risques (13), Temps et capacité (14), Finances et collaboration (15). |

### 2.2 Architecture de l'information
- **Planning** (`/p/:p/planning`, remplace `/p/:p/roadmap`, redirection conservée) : onglets Gantt, Board, Liste, Versions sur un même périmètre filtré ; la frise des versions actuelle devient l'onglet Versions.
- **Risques** : tickets d'un tracker « Risque » fourni en gabarit ; matrice dans **Rapports > Risques**.
- **Charge** et **Finances** : rapports réservés au chef de projet.
- **Portefeuille** : vue de la page Projets pour le chef de projet ; l'utilisateur reçoit les mêmes cartes dans Mon travail, filtrées sur ses tickets et sans finances.
- **Temps** : onglet du panneau de détail, feuille hebdomadaire dans Mon travail, chronomètre dans la barre haute.
- **Boîte de réception** : la page Notifications gagne les filtres par type et l'archivage. Les fils de discussion restent les commentaires des tickets.

### 2.3 Rôles
Chef de projet = rôle `athena-pm` et membre `manager` du projet ; utilisateur = membre `member`.

| Espace | Chef de projet | Utilisateur |
| --- | --- | --- |
| Centre de contrôle | Portefeuille de ses projets, jauges, jalons, burndown, alertes | Mon travail : ses tickets, jalons, alertes ; aucune finance |
| Planning | Dates, durées, dépendances, baselines, replanification, chemin critique | Lecture ; avancement et reste à faire de ses tickets ; demande de décalage par commentaire |
| Risques | Crée, évalue, clôt, crée les tâches de mitigation | Déclare un risque (score proposé), commente, réalise ses mitigations |
| Ressources | Matrice de charge, absences, capacité | Sa charge, ses absences |
| Temps | Valide les feuilles (circuit d'approbation existant) | Chronomètre et feuille hebdomadaire |
| Finances | Budget, coûts prévus et réels, projection (permission dédiée) | Aucun accès |
| Collaboration | Boîte de réception, automatisations du projet | Boîte de réception, abonnements |

L'AQ garde la lecture ; l'administrateur configure le calendrier et les taux de l'organisation.

### 2.4 Règles de planification
- Durées en **jours ouvrés** du calendrier de l'organisation (semaine ouvrée, jours fériés), puis des absences (lot 14).
- Dépendance unique en v1 : **fin → début** (« précède »), avec décalage en jours ouvrés ; les cycles sont refusés.
- Jalon = ticket de durée nulle, ou version.
- Calcul avant / arrière (marge, chemin critique) côté API, linéaire en tickets + liens.
- Une replanification qui déplace plusieurs tickets produit **un seul commit** « replanification » dans GitLab.
- Le rayon des barres est le jeton de rayon du thème (0 dans Athena et Contraste élevé).
- Heatmap des risques : 4 paliers nommés (faible 1-4, modéré 5-9, élevé 10-16, critique 20-25), score écrit dans chaque case, aucun dégradé.

## 3. Conséquences
- **Données** (numéros indicatifs, prochaine migration réelle : 058) : rôles sémantiques `start_date`, `progress`, `remaining` (lot 12), `probability`, `impact` (lot 13) ; type de lien « précède » avec décalage ; calendrier d'organisation ; dates planifiées dans la baseline ; type de champ calculé (13) ; `alert` (13) ; `worklog`, `absence`, `member_capacity` (14) ; `rate`, `project_budget`, équipes, `archived_at` des notifications (15).
- **Sécurité** : taux et coûts sous permission dédiée et permissions par champ ; jamais dans GitLab, les webhooks ni les exports non marqués.
- **ATQL** : `late()`, `critical()` (12), `atRisk()`, `criticality` (13).
- **Webhooks** : `schedule.changed` (12), `alert.raised` (13), `worklog.created` (14).
- **Noyau, pas plugin** : Gantt et matrice servent les gabarits Spatial et Défense.
- **Performance** : Gantt fluide à 500 lignes (critère du board).
- Le manuel utilisateur (Word) reste mis à jour en fin de projet (décision du 2026-11-10).

## 4. Lots suivants (à détailler à leur ouverture)
- **Lot 13, pilotage et risques** : champ calculé ; gabarit Risque ; Rapports > Risques (matrice 5 × 5, infobulles, liste) ; propagation « à risque » et `atRisk()` ; tâche de mitigation ; cartes Jauge, Jalons, Burndown global ; moteur d'alertes ; Portefeuille ; Mon travail filtré ; vérification.
- **Lot 14, temps et capacité** : worklog (API, droits, audit) ; chronomètre et onglet Temps ; feuille hebdomadaire et validation ; absences et capacité ; Rapports > Charge ; absences dans le moteur de dates ; alertes de surcharge ; vérification.
- **Lot 15, finances et collaboration** : taux par profil et budget ; Rapports > Finances ; carte budget ; boîte de réception (filtres, archivage) ; équipes (groupes Keycloak) ; automatisations sur tickets liés et équipes ; webhooks ; vérification.
