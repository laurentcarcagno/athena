# Lot 27 : vérification, gabarits de tableaux de bord

Rejouée le 2026-11-18 (`/goal`). Décisions : ADR-0010. Plan : `LOT27-PLAN.md`. Migration créée : 094 (prochaine : 095).

| Tâche | Critères | Constat | Preuve |
|---|---|---|---|
| T-0253 ADR-0010 | P1 à P11, R1, R2, priorité des rôles ; `STATE.md` | Fait | `ADR-0010-gabarits-de-tableaux-de-bord.md` |
| T-0254 contexte projet | nature (héritages), rôle dans le projet, chef limité (092) | Fait | `dashboard-template.test.ts` « T-0254 », « chef de projet limité » |
| T-0255 cartes relatives et répétées | projet courant ; une par projet ; 24 cartes au plus avec décompte ; pas de chevauchement | Fait | « résolution (P7) », « T-0255 » (chef, PMO, finance) |
| T-0256 portées élargies | cartes de portefeuille dans Mon travail ; recherches et graphiques dans un portefeuille ; catalogue finance ; refus conservés | Fait | « T-0256 », `dashboard.test.ts` ; la finance lit les portefeuilles (liste, résumé, santé, tendance) |
| T-0257 gabarits d'organisation | créer, modifier, dupliquer un livré, masquer, supprimer ; refus d'une carte non permise (P10) ; limites ; RLS ; OpenAPI et SDK | Fait | migration 094, test d'architecture RLS, `docs/api/openapi.json` |
| T-0258 proposition, application, défaut | union des rôles ; filtre nature et rôle dans le projet, nature en tête ; ajouter (8 onglets au plus) et remplacer ; défaut par type et rôle, une fois ; sans défaut : vide | Fait | « T-0258 » (3 tests), verrou de lecture simultanée, titre seul de l'onglet principal |
| T-0259 liste d'administration | filtres, livrés non modifiables, masquer/réafficher/dupliquer/supprimer/défaut ; axe | Fait | `dashboard-templates.test.tsx` |
| T-0260 éditeur | catalogue = intersection des rôles ; carte « une par projet / un par portefeuille » ; refus de l'API en clair ; clavier | Fait | `DashboardEditor.tsx` partagé avec « Organiser » (tests clavier de `Dashboard.test.tsx`) |
| T-0261 aperçu | résolution sur un projet ou portefeuille réels, droits de l'administrateur, rien d'enregistré | Fait | test « aperçu » (web), `preview` (API), e2e |
| T-0262 « Partir d'un gabarit » | bouton en mode Organiser ; liste proposée ; ajouter, remplacer avec confirmation ; message vide | Fait | `dashboard-templates.test.tsx` ; l'application est immédiate (écart de forme au plan : pas de brouillon, voir le plan) |
| T-0263 N1, N2 finances | PMO, directeur, finance, administrateur ; chef du projet pour N2 ; courbe prévu/réel | Fait | `PilotCards.test.tsx` ; chef de projet ajouté en lecture de `GET /v1/finance/projects/:p` (RLS : ses projets) |
| T-0264 N3 charge et capacité | trois périmètres | Fait | idem (sans périmètre : équipes visibles ; projet ; portefeuille) |
| T-0265 N4 feuille de route | 90 jours, retards signalés, tableau équivalent | Fait | idem (la frise est un tableau : lisible au lecteur d'écran) |
| T-0266 N5 phase et revue | gabarits ECSS et IM 1618 ; état vide explicite | Fait | idem |
| T-0267 N6, N7 portes, décisions, demandes | cohérent avec les pages, liens | Fait | idem |
| T-0268 N8 risques consolidés | matrice 5×5, cinq plus critiques, projet ou portefeuille | Fait | `GET /v1/projects/:p/risk-matrix` (nouvelle) ; test `governance.test.ts` |
| T-0269 N9 état de la plateforme | administrateur seul ; chaque ligne mène à l'écran | Fait | `platform-status.test.ts` ; « travaux en erreur » devient « réconciliation GitLab en échec » (les travaux ne gardent pas leur état) |
| T-0270 à T-0274 gabarits livrés | droits par rôle, ATQL valide, champs de graphique, pas de chevauchement, limites ; R1, R2 | Fait | « gabarits livrés » (23 gabarits : 9 pour Mon travail, 8 de projet, 3 d'avancement, 3 de portefeuille) |
| T-0275 e2e | administrateur → défaut → personne → copie ; projet ; chef limité | Fait | `e2e/tests/gabarits-tableaux-de-bord.spec.ts` (3 tests) |
| T-0276 documentation, démonstration, vérification | guides ; démonstration vide sans défaut ; vérification ; `STATE.md` | Fait | `docs/user/GUIDE.md`, `docs/admin/GABARITS-TABLEAUX-DE-BORD.md` |

## Écarts de forme au plan, tous justifiés

- **Catalogue des membres d'équipe** : Informations générales et Progression du sprint sont désormais posables par tout le monde (le gabarit « Membre du projet » validé les contient) ; Indicateurs clés, Avancement global, Phase et Feuille de route le sont aussi pour l'assurance produit (gabarit « Cycle en V »). Lecture de ce que ces rôles voient déjà.
- **Graphiques** : la recherche de répartition accepte tout champ de ticket ; « NCR par criticité » devient « par statut » (le tracker NCR n'a pas de criticité).
- **Chef de projet** : lit les finances des projets dont il est responsable (carte N2).
- **Onglet principal** : son renommage utilise l'adresse `…/tabs/main` (la version précédente appelait une adresse vide, que seuls les tests unitaires acceptaient).

## Suites

API et web : voir `STATE.md`. e2e : lancé spec par spec, base remise à zéro.
