# Lot 22 : PPM, incrément I5, temps passé et dépendances entre projets

Étude : `docs/ppm/` (§ I5 du plan, B36, `03` § 2.8 et 2.9, F4). Ouvert le 2026-11-18 par l'objectif de l'utilisateur (`/goal`). Un seul agent, sans sous-agent. Prochaine migration : **078**.

| Tâche | Backlog | Contenu | État |
|---|---|---|---|
| T-0230 | B36 | Temps passé : migration 078 `worklog`, service, API (saisie en heures et minutes, par ticket) | faite (078) |
| T-0231 | B36 | Planifié contre consommé (API et graphique), saisie dans la fiche du ticket | faite |
| T-0232 | B36 | Dépendances entre projets : migration 079, API, graphe et matrice, propagation d'un retard en lecture | faite (079) |
| T-0233 | — | `LOT22-VERIFICATION.md`, tests, `STATE.md` | |

Écart prévu (justifié) : la contrainte d'un prédécesseur externe n'est pas injectée dans le moteur de dates de chaque projet : la propagation est un calcul de portefeuille en lecture seule, comme le dit § 2.8 ; l'injection dans le moteur reste à faire.
