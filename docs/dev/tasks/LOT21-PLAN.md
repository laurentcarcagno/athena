# Lot 21 : PPM, incrément I4, capacité (première partie)

Étude : `docs/ppm/` (§ I4 du plan, B35, `03` § 2.9, F4, maquette `capacite.html`). Ouvert le 2026-11-18 par l'objectif de l'utilisateur (`/goal`). Un seul agent, sans sous-agent. Prochaine migration : **077**.

| Tâche | Backlog | Contenu | État |
|---|---|---|---|
| T-0225 | B35 | Calcul de capacité pur (`ppm/capacity.ts`) : périodes, capacité, charge, paliers, durées | faite |
| T-0226 | B35 | Migration 077 : disponibilité, absences, allocations ; services et API de saisie, droits | faite (077) |
| T-0227 | B35 | API de capacité : carte de chaleur, besoin contre capacité par rôle, goulots, granularité | faite |
| T-0228 | B35 | Interface : saisie (disponibilité, absences, allocations) et vues (carte de chaleur, histogramme, goulots) | |
| T-0229 | — | `LOT21-VERIFICATION.md`, tests, `STATE.md` (e2e : rejouer la suite quand la mémoire le permet) | |

Écart prévu : le job `capacite` (calcul différé) n'est pas fait : le calcul se fait à la lecture, il est linéaire en personnes × périodes (mesure en T-0229).
