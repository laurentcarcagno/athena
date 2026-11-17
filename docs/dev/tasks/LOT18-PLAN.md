# Lot 18 : PPM, incrément I1, santé du portefeuille

Étude : `docs/ppm/` (§ 2.4 météo, maquette `maquettes/sante-portefeuille.html`, backlog B17 à B26). Ouvert le 2026-11-17 par l'objectif de l'utilisateur (`/goal` : traiter tous les lots restants). Un seul agent, sans sous-agent. Prochaine migration : **071**.

| Tâche | Backlog | Contenu | État |
|---|---|---|---|
| T-0200 | B17 | Météo du projet : migration 071 `project_status_note`, API, carte de saisie | faite (071) |
| T-0201 | B18 | `GET /v1/portfolios/:k/health` : calculée, déclarée, forcée, écart, dates, phase, prochaine revue, risque maximal, filtres | faite |
| T-0202 | B19 | Tests de visibilité des agrégats (lecteur restreint contre complet) | |
| T-0203 | B20 | Page santé du portefeuille (tableau, pastilles libellées, hachure si forcé, états) | |
| T-0204 | B21 | Vue direction : six tuiles, concordance avec le tableau | |
| T-0205 | B22 | Export CSV du tableau de santé avec marquage | |
| T-0206 | B23 | Fiche projet d'une page `/p/:p/fiche`, impression A4 | |
| T-0207 | B24 | Portée de tableau de bord `portfolio:<clé>` et cartes santé et tuiles | |
| T-0208 | B25 | Rappel de météo (notification, une par période) | |
| T-0209 | B26 | Journal d'usage agrégé des routes de portefeuille | |
| T-0210 | — | `LOT18-VERIFICATION.md`, e2e, `STATE.md` | |

Règle : un commit par tâche, tests ciblés, e2e à la vérification du lot, handoff si le contexte approche 70 %.
