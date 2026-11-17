# Lot 18 : vérification (PPM, incrément I1, santé du portefeuille)

Date : 2026-11-17. Source : `docs/ppm/07-plan-livraison.md` § I1, `docs/ppm/08-backlog.md` B17 à B26.

## Recette mesurable de l'incrément I1

| Critère | Résultat | Preuve |
|---|---|---|
| Tableau de 50 projets en moins de 2 s | Oui, P95 1,6 s (mesuré sur `summary` ; `health` ajoute trois requêtes groupées pour tous les projets) | `docs/ppm/verifications/B16-sante-palier1.md`, `ppm/portfolio-perf.test.ts` |
| Zéro trace d'un projet masqué (test automatisé) | Oui : ligne, totaux, compteurs, dates, sponsor, risque, CSV | `ppm/health.test.ts` (B19, B22) |
| L'export CSV contient exactement les lignes de la vue | Oui | `ppm/health.test.ts`, e2e `sante-portefeuille.spec.ts` |
| La fiche d'une page s'imprime sur une page A4 par projet | Oui pour la mise en page (`@page` A4, seule la fiche reste en `print`) ; le nombre de pages réel dépend du contenu et n'a pas été mesuré en PDF | e2e (émulation `print`), `pages/project/ProjectSheetPage.test.tsx` |

## Tâches

| Tâche | Backlog | Résultat |
|---|---|---|
| T-0200 | B17 | météo du projet (071), carte de saisie |
| T-0201 | B18 | `GET /v1/portfolios/:k/health` |
| T-0202 | B19 | tests de visibilité |
| T-0203 | B20 | tableau de santé du portefeuille |
| T-0204 | B21 | six tuiles, concordance avec le tableau |
| T-0205 | B22 | export CSV marqué, formules neutralisées |
| T-0206 | B23 | fiche projet d'une page |
| T-0207 | B24 | portée de tableau de bord `portfolio:<clé>` (072) |
| T-0208 | B25 | rappel de météo (073), boucle du worker |
| T-0209 | B26 | journal d'usage agrégé (074) |

## Écarts

| Écart | État |
|---|---|
| B21 : flèche de tendance quand un instantané existe | Infaisable dans ce lot : les instantanés sont l'objet de l'incrément I3 ; la flèche s'y ajoute |
| B20 : « hachure si forcé » de la maquette | Remplacée par un cadre en pointillés et le mot « forcée » (la charte interdit les dégradés) |
| B20 : navigation au clavier propre au tableau | Liens et contrôles natifs, axe vert ; pas de raccourcis dédiés |
| B25 : une notification par période, rappel du projet sans chef | Un projet sans chef désigné n'a personne à rappeler : aucune notification |
| B23 : mesure du nombre de pages en PDF | Non mesuré (aucun moteur d'impression PDF dans l'environnement de test) |

## Tests

- API : 767 réussis, 1 ignoré (mesure B16 sous `ATHENA_PERF=1`). Web : 640 réussis.
- e2e : suite complète rejouée, 73 réussis, 3 ignorés (nouveau spec `sante-portefeuille`, `/p/ARI/fiche` ajouté à l'audit axe).
- Migrations réelles du lot : 071 à 074. Prochaine : 075.
- Défaut réel trouvé par l'e2e : les cartes de portefeuille s'imbriquaient dans la carte du tableau de bord (la charte interdit les cartes imbriquées) ; corrigé par la prop `bare`, avec un test unitaire.
