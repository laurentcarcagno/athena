# Lot 21 : vérification (PPM, incrément I4, capacité, première partie)

Date : 2026-11-18. Source : `docs/ppm/07-plan-livraison.md` § I4, `docs/ppm/08-backlog.md` B35, `docs/ppm/04-fonctionnalites.md` F4.

## Recette

| Critère | Résultat | Preuve |
|---|---|---|
| Capacité calculée égale au calcul de référence (temps partiel, jour férié, demi-journée) | Oui : 80 %, un férié, deux jours d'absence = 18 jours × 7 h 48 × 0,8 ; demi-journée ; absence un week-end ou un jour férié sans effet | `ppm/capacity.test.ts`, `ppm/capacity-view.test.ts` |
| Même total en semaines et en mois | Oui (calcul par jour ouvré, prorata de la semaine à cheval) | `ppm/capacity.test.ts`, `ppm/capacity-view.test.ts` |
| Un manager ne voit que ses équipes | Oui ; une personne ne voit que la sienne ; PMO et direction tous ; motif des absences masqué au PMO | `ppm/capacity-view.test.ts`, `ppm/capacity-data.test.ts` |
| Volumétrie | 100 personnes sur 12 mois en moins de 2 s à la lecture | `ppm/capacity-view.test.ts` |

## Écarts

| Écart | État |
|---|---|
| Job `capacite` (calcul différé) | Inutile à cette volumétrie (mesure ci-dessus) ; calcul à la lecture |
| `remaining` en minutes et migration des valeurs existantes | Reporté avec le temps passé (I5) : l'unité existante est le jour, hypothèse de `docs/ppm/verifications/B15-remaining.md` |
| Saisie de la disponibilité et des allocations par l'interface | **Levé** : formulaires de la page Capacité (disponibilité avec durée de la journée en heures et minutes, allocation nominative ou générique) |
| Planning d'affectation par personne | **Levé en version tableau** : les projets de chaque personne et période figurent dans la carte de chaleur ; pas de diagramme de Gantt par personne |
| Besoin contre capacité par rôle | **Levé** : courbes capacité et besoins par rôle de l'équipe |
| Saisie de durées | `parseDuration` (heures et minutes) utilisé par la disponibilité ; le worklog arrive en I5 |

## Tests

- API : 807 réussis (suite complète au passage T-0227) puis `capacity-view` ; web : 658 réussis. e2e : suite non rejouée depuis l'interruption du lot 20 (arrêt système pour manque de mémoire) ; la route `/capacite` est ajoutée à l'audit axe de `audit.spec.ts`. À rejouer en entier : `cd e2e && pnpm test`.
- Migration du lot : 077. Prochaine : 078.
