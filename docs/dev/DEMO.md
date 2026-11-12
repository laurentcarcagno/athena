# Projet de démonstration LUMEN

Nanosatellite d'observation de la Terre (12U, orbite héliosynchrone à 500 km), équipe pluridisciplinaire. Il illustre les fonctions d'Athena sur un cas réaliste : gabarit Spatial (ECSS), traçabilité, planning, agile, risques, approbations.

## Créer la démonstration
Prérequis : l'infrastructure de développement et `node tools/dev-start.mjs` en marche (API sur 3001, Keycloak sur 8080).

```
node tools/demo-satellite.mjs            # crée les comptes Keycloak et le projet LUMEN (idempotent)
node tools/demo-satellite.mjs --finish   # rejoue seulement les favoris et la baseline PDR
```

Chaque action est faite par la personne concernée (jeton de son compte) : auteurs, historique GitLab, notifications et mentions sont réels. `dev-start` relève la limite de débit de l'API (6 000 appels par minute) pour ce type d'amorçage. Le script ne supprime rien : pour le refaire, il faut d'abord retirer le projet LUMEN de la base de développement.

## Comptes (mot de passe : `demo-<prénom>`)
| Compte | Rôle dans l'équipe | Rôle Athena |
| --- | --- | --- |
| `claire.lefevre` | Cheffe de projet | `athena-pm`, chef du projet LUMEN |
| `marc.dubois` | Architecte système | utilisateur |
| `sophie.martin` | Architecte satellite (mission) | utilisateur |
| `thomas.bernard` | Ingénieur SCAO | utilisateur |
| `lea.petit` | Thermicienne | utilisateur |
| `hugo.roux` | Architecte logiciel | utilisateur |
| `nina.garcia` | Développeuse logiciel de vol | utilisateur |
| `paul.moreau` | Ingénieur AIT (assemblage, intégration, essais) | utilisateur |
| `ines.girard` | Développeuse segment sol | utilisateur |
| `julien.simon` | Ingénieur énergie | utilisateur |
| `emma.fournier` | Assurance produit | `athena-qa` (lecture et visa) |

Le compte `admin.dev` (`dev-only-admin`) administre l'organisation : calendrier, trackers, circuit d'approbation, automatisation.

## Ce qu'il contient
- **Exigences** : 9 système (SYS), 9 logicielles (SRS) ; **conception** (SDD, 5), **interfaces** (ICD, 2), **vérification** (VER, 6). Liens de traçabilité `raffine`, `satisfait`, `vérifie`, `implémente` ; des exigences non couvertes pour la matrice et la couverture.
- **Planning** : 4 phases (tâches parentes), 22 tâches, 4 jalons (PDR, CDR, QR, AR), 25 dépendances « précède » (dont un décalage), calendrier avec jours fériés, chemin critique, tâches en retard. Les tâches sont assignées aux bonnes personnes, avec points et priorité.
- **Agile** : 4 sprints (2 clos, 1 actif, 1 planifié) et un backlog classé ; **versions** OBSW 0.1 (publiée), 0.5 et 1.0.
- **Qualité** : 5 anomalies (SPR, dont 2 critiques), 2 non-conformités, 2 évolutions (CR), 1 dérogation (RFD), 3 RID de la PDR.
- **Risques** : registre de 9 risques (probabilité, impact, criticité, mitigation, responsable), liés aux exigences, tâches et interfaces concernées.
- **Collaboration** : commentaires avec mentions (notifications), circuit d'approbation des évolutions en trois étapes (revue technique, cheffe de projet, visa assurance produit), automatisation sur les anomalies critiques, recherches enregistrées (ATQL : `critical()`, `late()`, criticité des risques), favoris.
- **Historique** : tout est écrit dans GitLab ; baseline `PDR` figée, planning compris.

## Parcours suggérés
- `claire.lefevre` : Mon travail (à approuver, mentions), Planning (Gantt, chemin critique, comparaison à la baseline PDR), Backlog et sprints, Versions.
- `thomas.bernard` : ses tâches SCAO, l'anomalie critique du filtre de Kalman, la dérogation de pointage.
- `emma.fournier` : lecture seule, visa de la dernière étape d'approbation.
- `hugo.roux` : traçabilité (arbre, matrice, couverture) et anomalies bloquantes.
