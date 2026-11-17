# Lot 22 : vérification (PPM, incrément I5, temps passé et dépendances entre projets)

Date : 2026-11-18. Source : `docs/ppm/07-plan-livraison.md` § I5, `docs/ppm/08-backlog.md` B36, `03` § 2.8 et 2.9.

## Recette

| Critère | Résultat | Preuve |
|---|---|---|
| Un lien inter-projets exige de voir les deux projets | Oui : politique `acl_link_ok` sur les deux tickets ; un lecteur privé d'un projet ne voit ni le lien ni le projet | `ppm/dependency.test.ts` |
| La propagation n'écrit rien | Oui : calcul en deux passes, le planning de chaque projet reste identique (test) | `ppm/dependency.test.ts` |
| Temps passé saisi en heures et minutes, par ticket, suit la visibilité du ticket | Oui (`parseDuration` côté interface, minutes côté API, politique `acl_artifact_ok`) | `ppm/worklog.test.ts`, `WorklogSection.test.tsx` |
| Planifié contre consommé | Oui : allocations contre temps passé par période et par personne | `ppm/worklog.test.ts`, `WorklogSection.test.tsx` |

## Écarts

| Écart | État |
|---|---|
| Injection d'un prédécesseur externe comme contrainte de date dans le moteur de chaque projet | Non faite par choix de conception (§ 2.8 : la propagation est un calcul de portefeuille en lecture seule) ; faisable plus tard |
| Planning d'affectation par personne (diagramme de Gantt) | Version tableau dans la carte de chaleur de la capacité (I4) ; pas de Gantt par personne |
| Création de liens par le chef de projet | Réservée au PMO et à l'administrateur (un lien engage deux projets) |
| Graphe orienté des dépendances (nœuds et flèches) | Matrice et liste avec marge ; pas de dessin de graphe (le composant `<Chart>` n'a pas de type graphe) |
| `remaining` en minutes et migration des valeurs existantes | Non faite : unité existante = jour (voir `docs/ppm/verifications/B15-remaining.md`) ; à traiter avec la décision de l'unité par projet |

## Tests

- API : tests ciblés verts (worklog 3, dependency 5) ; web 665 réussis. e2e : suite non rejouée depuis l'interruption du lot 20 (arrêt système pour manque de mémoire) ; à rejouer en entier.
- Migrations du lot : 078 (worklog), 079 (dépendances). Prochaine : 080.
