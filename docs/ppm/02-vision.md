# PPM Athena — 02. Vision et périmètre

## Résumé

1. **Problème** : la direction et le PMO n'ont pas de vue consolidée et fiable de l'état des projets d'une instance. Les revues de portefeuille se préparent à la main, à partir de chaque projet.
2. **V1 (validée)** : roadmap consolidée et santé du portefeuille, sur les données déjà saisies au niveau projet. Rien n'est ressaisi.
3. **V2** : capacité (granularité configurable par portefeuille et par projet), puis finances (saisie manuelle et import de fichier). **V3** : demandes et priorisation pondérée, scénarios, valeur acquise.
4. **Personas V1** : direction, PMO (gestionnaire de portefeuille), chef de projet, manager d'équipe ; administrateur et auditeur en appui. Tous les rôles existants sont concernés (votre réponse 3).
5. **Principe structurant** : le portefeuille **référence et agrège**, il ne copie jamais une donnée de projet. Tout agrégat se calcule sous les droits du lecteur.
6. **Prérequis** avant la V1 : P1 (dates, statut et sponsor du projet) et P6 (dates des revues de phase). P2 et le volet critères manuels de P6 sont faits (commit `8b5d77c`).
7. **Décisions attendues** : valider le découpage V1/V2/V3 (§ 3) et l'hypothèse de volumétrie (§ 5).

---

## 1. Problème et scénarios prioritaires

Athena gère bien un projet, mais rien au-dessus. Pour répondre à « quels projets dérivent, et pourquoi ? », un directeur ouvre chaque projet. Pour une revue, le PMO recopie des chiffres dans un support figé. Le socle du lot 16 (portefeuilles, santé calculée, équipes) a amorcé la réponse, sans dates, sans historique et sans roadmap.

| # | Scénario | Persona | Version |
|---|---|---|---|
| S1 | Voir en une page l'état de tous les projets d'un portefeuille, les plus à risque d'abord, avec la tendance depuis la dernière revue | Direction, PMO | V1 |
| S2 | Voir sur une frise les projets, leurs phases normatives, leurs revues (SRR, PDR, CDR…) et leurs jalons, réel contre baseline | PMO, direction | V1 |
| S3 | Préparer une revue de portefeuille : figer un instantané, commenter chaque projet, exporter | PMO, chef de projet | V1 |
| S4 | Repérer les passages de gate en retard et les critères non remplis | PMO, assurance qualité | V1 |
| S5 | Voir la charge d'une équipe contre sa capacité par semaine ou par mois | Manager, PMO | V2 |
| S6 | Suivre budget, engagé, réel et prévision par projet ; importer les réels | PMO, direction, finance | V2 |
| S7 | Déposer une demande, la scorer, la convertir en projet | Demandeur, PMO | V3 |
| S8 | Comparer des scénarios d'arbitrage sans toucher au plan officiel | PMO, direction | V3 |

## 2. Personas

| Persona | Rôle Athena (observé) | Besoin V1 | Remarque |
|---|---|---|---|
| Direction | `athena-director` | S1, S2, lecture seule | Cinq à sept indicateurs, puis navigation descendante |
| PMO, gestionnaire de portefeuille | **à créer** : `athena-pmo`, ou `athena-admin` en attendant | S1 à S4, édition des portefeuilles et des revues | **Hypothèse** : le PMO n'est pas administrateur de l'instance. Si c'est faux, `athena-admin` suffit et aucun rôle n'est créé. |
| Chef de projet | `athena-pm` | Tenir les dates, la phase, le commentaire de santé de son projet | Déjà responsable des données de son projet |
| Manager d'équipe | `athena-manager` | V1 : charge en tickets (lot 16) ; V2 : capacité | — |
| Sponsor, demandeur | `athena-team-member` (lecture) | V3 | Regroupés : pas de besoin propre en V1 |
| Finance | à décider en V2 | V2 | Seul à voir les coûts unitaires des ressources (§ 4) |
| Administrateur, auditeur | `athena-admin`, `athena-qa` | Paramétrage, piste d'audit | L'audit existe déjà (`audit_log`, journal chaîné) |

## 3. Périmètre

### V1 : roadmap et santé (incréments 1 et 2 du plan)
- Portefeuilles à un seul niveau (votre réponse 7), projets rattachés (existant du lot 16).
- Fiche projet enrichie : dates, statut de cycle de vie, sponsor, description (P1).
- Phases normatives datées : prévu, réel, revue tenue, décision de gate (P6).
- Tableau de santé : délai, risque, avancement, phase ; tendance depuis le dernier instantané ; commentaire du chef de projet.
- Roadmap consolidée en lecture : couloirs par projet, phases, revues, versions, réel contre baseline.
- Instantanés de portefeuille (revue) et comparaison entre deux instantanés.
- Matrice des risques consolidée (après P5).
- Export CSV de chaque vue ; impression PDF par feuille de style d'impression, sans nouvelle dépendance.
- Cartes de tableau de bord « portefeuille » réutilisant la grille existante.

### V2 : capacité, puis finances
- **Capacité** : capacité par équipe et par période, allocations en ETP par projet, absences, carte de chaleur, besoin contre capacité. La granularité (semaine ou mois) se règle par portefeuille et par projet (réponse 4). *Reportée* parce qu'il faut d'abord un modèle de capacité qui n'existe pas (cartographie § 4) et une unité de charge fixée.
- **Finances** : lignes budgétaires par projet et catégorie, engagé, réel, prévision, saisie manuelle **et** import CSV (réponse 5), courbe en S, alertes de dépassement. *Reportée* parce qu'aucune donnée financière n'existe et que les droits de lecture des coûts restent à arrêter.
- Dépendances inter-projets (P3) et propagation des retards.

### V3
- Demandes et pipeline (sur un tracker « Demande » d'un projet de pilotage), scoring pondéré, conversion en projet.
- Scénarios what-if (planning, capacité, budget), comparateur.
- Valeur acquise (CPI, SPI) : il faut avancement et coûts fiables.
- Intégration à un système financier externe : point d'extension uniquement.

## 4. Principes non négociables

1. **Source de vérité unique** : dates, statuts, risques et charges restent dans les tickets, versions, phases et baselines du projet. Le portefeuille stocke ce qui est propre à son niveau (rattachement, santé forcée, commentaire, instantané, décision) et rien d'autre.
2. **Réutilisation** : moteur de dates (`schedule-engine.ts`), calendrier (`work-calendar.ts`), indicateurs (`kpi.service.ts`), grille de tableau de bord, composants SVG et thèmes existants. **Une seule dépendance ajoutée** : Apache ECharts, chargée à la demande, pour les formes que les composants maison ne couvrent pas (choix justifié dans `04-fonctionnalites.md` § 0.1).
3. **Visibilité des agrégats** : tout calcul de portefeuille s'exécute **sous l'identité du lecteur**, avec les politiques RLS restrictives, jamais en contexte système. Un projet masqué n'entre dans aucun total, aucun compte, aucun graphique. Aucun message ne signale qu'il manque des projets. Un rappel permanent et neutre « périmètre : projets que vous pouvez voir » accompagne chaque agrégat.
4. **Instantanés au grain projet** : un instantané fige des lignes par projet, jamais un total. À la relecture, la RLS refiltre ces lignes, ce qui ferme la fuite par l'historique.
5. **Traçabilité** : chaque écriture de niveau portefeuille passe par `audit()` ; chaque décision de gate est nominative et datée.
6. **Une seule instance** : aucune consolidation inter-instances, aucun flux sortant (cohérent avec le réseau isolé).
7. **Performance** : calcul à la demande dans le palier 1 ; matérialisation par projet au-delà (§ 5).
8. **Coûts unitaires des ressources** (V2) : visibles par les seuls rôles finance et administrateur. Les autres voient des montants agrégés par projet.

## 5. Volumétrie : impact du choix (votre question 2)

La volumétrie change trois choses : le mode de calcul des agrégats, la lisibilité des vues, et le coût des instantanés. En voici l'effet par palier.

| Palier | Projets par instance | Tickets | Personnes | Calcul des agrégats | Vues | Instantanés |
|---|---|---|---|---|---|---|
| 1 | ≤ 50 | ≤ 50 000 | ≤ 150 | À la demande : `kpi.service` par projet, en parallèle (déjà le cas) | Toutes lisibles sans pagination | Hebdomadaires, coût négligeable |
| 2 | 50 à 300 | ≤ 500 000 | ≤ 1 000 | Indicateurs par projet **matérialisés** dans une table rafraîchie par l'outbox et un job ; la RLS s'applique toujours par projet | Roadmap regroupée par portefeuille et repliée ; tableau paginé à 50 ; carte de chaleur agrégée par équipe | Hebdomadaires, une ligne par projet |
| 3 | > 300 | > 500 000 | > 1 000 | Matérialisation, index dédiés, mesure de charge obligatoire | Vues par portefeuille uniquement, filtres obligatoires | Mensuels en plus des revues ; rétention à fixer |

**Hypothèse retenue pour la conception** : palier 2 (jusqu'à 300 projets par instance, horizon de 36 mois). Le modèle et les API acceptent la matérialisation sans changement de contrat. Le premier incrément reste au palier 1 (calcul à la demande), et l'on bascule en mesurant (voir le plan de livraison). Si la cible réelle est au palier 1, la matérialisation et son job sortent du périmètre (environ un incrément de moins). Si elle est au palier 3, les mesures de charge que vous avez prévues pour la fin deviennent un prérequis de l'incrément 3.

## 6. Documents d'entrée pour le cycle de vie spatial (votre question 6)

Pour écrire un gabarit « cycle projet spatial » (phases 0, A à F et leurs revues) dans le mécanisme de gabarits normatifs existant, il faut :

1. **ECSS-M-ST-10C Rev.1** (*Project planning and implementation*) : définition des phases 0 à F, des revues associées (MDR, PRR, SRR, PDR, CDR, QR, AR, ORR, FRR, LRR, CRR, ELR, MCR) et de leurs objectifs.
2. **ECSS-M-ST-10-01C** (*Organization and conduct of reviews*) : déroulé d'une revue, rôle du comité, traitement des RID, critères de clôture. Ce document fournit les critères d'entrée et de sortie.
3. **Votre tailoring** de ces normes pour les projets visés : phases réellement utilisées, revues fusionnées ou supprimées (par exemple QR et AR groupées), niveau de projet (système, sous-système, équipement).
4. **La liste des livrables attendus à chaque revue** (DRL : *Document Requirements List*, ou l'annexe du plan de management), avec leurs identifiants internes.
5. **Le plan de management de projet type** (ou plan assurance produit) de l'entreprise, pour les critères manuels propres (par exemple « dossier de justification approuvé par l'AQ »).
6. Côté défense, l'équivalent : votre référentiel de cycle de vie (jalons étatiques, revues contractuelles) et l'AQAP applicable.

Les éditions exactes et le tailoring sont à fournir par le responsable méthodes ou le responsable assurance produit. Sans eux, le gabarit reste un squelette à compléter.
