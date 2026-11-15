# PPM Athena — Annexe : cycles de vie spatial (ECSS) et défense (DGA)

## Résumé

1. **Spatial** : nous suivons ECSS-M-ST-10C Rev.1 (phases et revues de projet) et ECSS-M-ST-10-01C (conduite des revues). Les deux ont été téléchargés et lus (§ 1).
2. Le cycle projet comporte 7 phases (0, A à F) et 13 revues, de la MDR à la MCR. Il devient un **nouveau gabarit normatif « Projet spatial (ECSS-M-ST-10) »**, distinct du gabarit logiciel ECSS-E-ST-40 existant.
3. Les critères de passage viennent du processus de revue de M-ST-10-01C : conditions d'entrée confirmées, dossier de revue complet, RID majeurs clos, rapport de l'autorité de revue émis. Les critères manuels sont confirmés et datés (migration `064`).
4. **Défense, DGA cliente** : l'instruction ministérielle IM 1618 découpe une opération d'armement en **Préparation, Réalisation, Utilisation**, puis Retrait. Le jalonnement passe par de « grandes revues ». J'ai lu le support DGA « calque 1618 » ; le texte de l'IM 1618 n'a pas pu être téléchargé (§ 2).
5. Côté industriel sous contrat DGA, les revues techniques contractuelles et l'assurance qualité (AQAP) se fixent **dans le contrat**. Ce point est marqué hypothèse, à confirmer pour chaque marché.
6. **Décision attendue** : valider les deux gabarits proposés (§ 1.4 et § 2.4) ; les écrire dans le code est une tâche du backlog (phase 3).

Sources téléchargées dans `docs/ppm/references/` (fichiers ignorés par Git : ce sont des documents tiers). Elles se rechargent depuis les liens du § 3.

---

## 1. Spatial : ECSS-M-ST-10C Rev.1 et ECSS-M-ST-10-01C

### 1.1 Phases (ECSS-M-ST-10C Rev.1, § 4.4.1 et § 4.4.3) — Observé

| Phase | Nom (norme) | Tâches principales (extraits) | Revues associées |
|---|---|---|---|
| 0 | Analyse de mission, identification du besoin | Énoncé de mission, spécification technique préliminaire, évaluation préliminaire des risques | MDR (fin de phase) |
| A | Faisabilité | Plans préliminaires de management, d'ingénierie et d'assurance produit ; comparaison des concepts ; arbre fonctionnel | PRR (fin de phase) |
| B | Définition préliminaire | Calendrier directeur et coût à terminaison de référence ; conception préliminaire ; arbre produit, WBS, arbre de spécifications ; programme de vérification | SRR (en cours de phase), PDR (fin de phase) |
| C | Définition détaillée | Conception détaillée, préqualification des éléments critiques, plans d'AIT, interfaces détaillées | CDR (fin de phase) |
| D | Qualification et production | Essais de qualification, fabrication, interopérabilité sol-bord, dossier de recette | QR (en cours), AR et ORR (fin de phase), § 4.4.3.6.2 |
| E | Utilisation | Préparation du lancement, lancement et premières opérations, recette en orbite, exploitation, plan de retrait | FRR, LRR, CRR, ELR, § 4.4.3.7.2 |
| F | Retrait | Mise en œuvre du plan de retrait | MCR, § 4.4.3.8.2 |

### 1.2 Revues de projet et objectifs — Observé

| Revue | Phase | Objectif principal (résumé de la norme) | Clause |
|---|---|---|---|
| MDR, Mission Definition Review | Fin de 0 | Publier l'énoncé de mission ; évaluer la spécification technique préliminaire et les aspects programmatiques ; juger l'aptitude à entrer en phase A | § 4.4.3 |
| PRR, Preliminary Requirements Review | Fin de A | Publier les plans préliminaires et la spécification technique ; confirmer la faisabilité ; choisir concepts, philosophie de modèles et approche de vérification | § 4.4.3 |
| SRR, System Requirements Review | Pendant B | Publier les spécifications mises à jour ; évaluer la définition préliminaire et le programme de vérification préliminaire | § 4.4.3 |
| PDR, Preliminary Design Review | Fin de B | Vérifier la conception préliminaire ; publier les plans définitifs, arbre produit, WBS, arbre de spécifications, plan de vérification ; juger l'aptitude à entrer en phase C | § 4.4.3 |
| CDR, Critical Design Review | Fin de C | Évaluer la qualification des procédés critiques ; confirmer les interfaces externes ; publier la conception finale et les plans d'AIT | § 4.4.3 |
| QR, Qualification Review | Pendant D | Confirmer que la vérification démontre le respect des exigences, marges comprises ; dossier de vérification complet ; dérogations acceptables | § 4.4.3.6.3 |
| AR, Acceptance Review | Fin de D | Produit exempt de défaut de fabrication ; livrables disponibles ; « tel que construit » contre « tel que conçu » ; dossier de recette complet ; autoriser la livraison ; certificat de recette | § 4.4.3.6.4 |
| ORR, Operational Readiness Review | Fin de D | Procédures et équipes d'exploitation prêtes ; recette du segment sol pour l'exploitation | § 4.4.3.6.5 |
| FRR, Flight Readiness Review | E, avant le lancement | Segments vol et sol prêts pour le lancement | § 4.4.3.7.3 |
| LRR, Launch Readiness Review | E, juste avant le lancement | Déclarer l'aptitude au lancement et autoriser le lancement | § 4.4.3.7.4 |
| CRR, Commissioning Result Review | E, après la recette en orbite | Déclarer l'aptitude à l'exploitation de routine ; transfert formel à l'exploitant | § 4.4.3.7.5 |
| ELR, End-of-Life Review | E, fin de mission | Mission terminée ; éléments en orbite configurés pour un retrait sûr | § 4.4.3.7.6 |
| MCR, Mission Close-out Review | Fin de F | Toutes les activités de retrait achevées | § 4.4.3.8.3 |

Règles générales (§ 4.4.1) :
- Une **baseline de configuration** s'établit à l'issue de chaque revue majeure (ECSS-M-ST-40).
- Toutes les revues jusqu'à l'AR (sauf la MDR) se tiennent à chaque niveau de la chaîne client-fournisseur : PRR à PDR de haut en bas, CDR à AR de bas en haut.
- Des revues propres au projet peuvent s'ajouter (§ 4.4.4).
- La norme donne en annexe F une matrice **indicative** des documents de management attendus par revue (WBS, calendrier, plan de gestion de configuration, gestion des risques…). Le contenu réel du dossier de revue se fixe dans l'accord contractuel.

### 1.3 Conduite d'une revue (ECSS-M-ST-10-01C) — Observé

- **Déroulé** (§ 4.2) : initialisation (organes de revue, procédure, vérification des prérequis), dossier de revue (*data package*) et réunion de lancement, examen par l'équipe de revue avec RID, conclusions et suites.
- **Conditions d'entrée** (§ 5.4) : le client confirme les prérequis de la procédure et le chef de l'équipe de revue l'accepte. Sinon, il propose à l'autorité de revue de redéfinir, corriger ou reporter.
- **Réunions** (§ 5.5) : point clé des prérequis, lancement, coordination (envoi des RID au fournisseur), colocalisation (réponses, disposition finale des RID, actions), clôture de l'équipe, réunion de l'autorité de revue (atteinte des objectifs, rapport).
- **RID** (§ 5.6) : classés **majeurs** (ils touchent un objectif de la revue) ou **mineurs**. Un RID est clos quand sa disposition et ses actions sont acceptées par toutes les parties. Les RID ouverts remontent à l'autorité de revue.
- **Documents** (annexes A à D, DRD) : procédure de revue (avec ses **critères de succès**), formulaire RID, rapport de l'équipe de revue, rapport de l'autorité de revue.

### 1.4 Gabarit proposé « Projet spatial (ECSS-M-ST-10) »

Ce gabarit est écrit dans le schéma existant (`apps/api/src/core/normative-template.ts`). C'est une proposition à coder dans un incrément.

- **Normes** : ECSS-M-ST-10C Rev.1 (6 mars 2009), ECSS-M-ST-10-01C (15 novembre 2008).
- **Revues** : `mdr`, `prr`, `srr`, `pdr`, `cdr`, `qr`, `ar`, `orr`, `frr`, `lrr`, `crr`, `elr`, `mcr`, avec les noms du § 1.2.
- **Phases**, chacune avec sa revue de fin : `phase-0` (MDR), `phase-a` (PRR), `phase-b` (PDR), `phase-c` (CDR), `phase-d` (AR), `phase-e` (ELR), `phase-f` (MCR). Les revues intermédiaires (SRR, QR, ORR, FRR, LRR, CRR) sont des jalons datés de la phase dans `project_phase`, pas des fins de phase.
- **Trackers repris du gabarit spatial existant** : RID (avec un champ `review` étendu aux 13 revues et une classe `majeur` / `mineur`), NCR, CR, RFD/RFW, risques, actions.
- **Critères de sortie** de la phase `phase-x`, pour sa revue R (d'après M-ST-10-01C) :
  1. `manual` « Prérequis de la revue R confirmés par le client » (§ 5.4) ;
  2. `manual` « Dossier de revue R complet et diffusé » (§ 5.1) ;
  3. `tracker_status` : tous les RID **majeurs** de la revue R clos (`where: review = R`, avec une classe à ajouter au filtre) (§ 5.6) ;
  4. `manual` « Rapport de l'autorité de revue R émis : objectifs atteints » (§ 5.5.6, annexe D).
- **Critères d'entrée** de la phase suivante : `manual` « Baseline de configuration établie à la revue R » (§ 4.4.1).
- **Livrables par phase** : repris de la matrice indicative (annexe F), à ajuster avec votre DRL contractuelle.
- **Évolution du schéma nécessaire** (petite) : le critère `tracker_status` ne filtre aujourd'hui que sur un champ (`where: { field, value }`, `normative-template.ts:15`). Il faut pouvoir filtrer sur deux champs (revue **et** classe majeur). C'est une tâche du backlog.
- **Articulation avec le gabarit logiciel** : un projet porte un seul gabarit. Le gabarit « Projet spatial » s'applique au projet système ; un sous-projet logiciel garde le gabarit ECSS-E-ST-40 existant. Le portefeuille les montre côte à côte : un portefeuille peut contenir des projets de gabarits différents.

---

## 2. Défense : opérations d'armement, DGA cliente

### 2.1 Ce qui a pu être lu

| Source | Résultat |
|---|---|
| IM 1618 (15 février 2019, publiée au BOA le 11 avril 2019), `archives.defense.gouv.fr` | **Manquant** : le site ne répond pas (nom d'hôte introuvable). À obtenir auprès du correspondant DGA du marché, ou d'un autre réseau. |
| Support DGA « Calque 1618 : activités cyber » (10/01/2023, NP), `armement.defense.gouv.fr` | **Lu** (texte extrait). Le jalonnement y est présenté étape par étape, dans l'ordre des planches. |

### 2.2 Phases et revues (support « calque 1618 ») — Observé, sauf mention

- **Phases** : **Préparation** (avec une étape d'**orientation**), **Réalisation**, **Utilisation**, puis **Retrait** (planche « Phase d'utilisation »).
- **Trois natures de revue** (planche « Jalonnement des opérations : principales revues ») :
  - **revue étatique majeure**, liée à une approbation au niveau supérieur ;
  - **revue programme**, qui est un jalon de décision au niveau du programme ;
  - **revue d'équipe**, interne, sans jalon de décision (coordination).

| Ordre | Revue | Enjeu (selon le support) | Phase (Hypothèse : déduite de l'ordre des planches) |
|---|---|---|---|
| 1 | Revue d'ingénierie de cadrage | Analyse du besoin complète ; pouvoir lancer la comparaison des solutions d'architecture | Préparation |
| 2 | Revue de dimensionnement technique | Faisabilité technique et soutenabilité RH de l'opération | Préparation |
| 3 | Comité des devis | Valider le devis de l'opération | Préparation |
| 4 | Revue de hiérarchisation des solutions | Justifier un choix de solution ; lancer la rédaction des éléments de consultation | Préparation |
| 5 | Consultation (des industriels) | Cohérence et complétude du dossier de consultation | Préparation |
| — | Revue de cohérence capacitaire | Prise en compte de l'objectif capacitaire par les opérations qui y contribuent ; périodique (« semestriellement ? ») | Transverse |
| 6 | Revue de synchronisation et de lancement | Synchroniser les équipes sur le périmètre technique et le calendrier de la phase | Début de Réalisation |
| 7 | Revue d'aptitude aux essais | Être prêt pour les essais de qualification étatique | Réalisation |
| 8 | Revue de qualification, **prononcé de qualification** | Émettre un avis sur la qualification, avec recommandations | Réalisation |
| 9 | Revue de mise en service opérationnelle, **prononcé de MSO** | Conditions réunies pour utiliser le système en contexte opérationnel | Passage à Utilisation |

Le support présente chaque revue sous la même forme : enjeux, objectifs, acteurs, données d'entrée, sorties. C'est exactement la structure d'un critère de passage du gabarit.

### 2.3 Côté industriel sous contrat DGA — Hypothèse

- Le fournisseur tient ses **revues techniques contractuelles** (de type SRR, PDR, CDR, TRR, revue de qualification, revue de recette), dont la liste et les critères sont fixés par le contrat. Impact si faux : le gabarit industriel se réduit aux jalons étatiques du § 2.2.
- L'**assurance qualité** contractuelle se réfère couramment aux publications OTAN AQAP (AQAP 2110 pour les exigences d'assurance qualité, AQAP 2105 pour le plan qualité des livrables), comme le gabarit défense existant (`templates/defense.ts`). Impact si faux : seuls les libellés de normes du gabarit changent.
- **À obtenir** (Manquant) auprès du responsable du marché : la liste contractuelle des revues, leurs critères, la liste des documents à livrer et l'AQAP applicable.

### 2.4 Gabarit proposé « Opération d'armement (IM 1618), vue industrielle »

- **Phases** : `preparation`, `realisation`, `utilisation`, `retrait`.
- **Revues** : les neuf du § 2.2, chacune typée (étatique majeure, programme, équipe) dans son nom. Les revues étatiques et programme sont des jalons de décision ; une revue d'équipe n'est qu'une date.
- **Critères de sortie** de la phase Réalisation : `manual` « Prononcé de qualification obtenu », `tracker_status` « faits techniques majeurs clos » (tracker TF du gabarit défense), `tracker_status` « remarques de revue (RRV) closes », et l'approbation par l'assurance qualité étatique déjà en place (`041_approval.sql`).
- **Critère d'entrée** de la phase Utilisation : `manual` « Prononcé de MSO ».
- **Revues contractuelles du fournisseur** (§ 2.3) : ce sont des jalons datés de la phase Réalisation, ajoutés par le contrat via l'héritage de gabarits (`template-inherit.ts`) : un gabarit par marché dérivé de celui-ci.
- **Instance** : ces projets vivent sur l'instance défense isolée. Le portefeuille défense n'agrège que cette instance.

---

## 3. Références

| Document | Lien | Copie locale |
|---|---|---|
| ECSS-M-ST-10C Rev.1, *Project planning and implementation* | [ecss.nl](https://ecss.nl/standard/ecss-m-st-10c-rev-1-project-planning-and-implementation/) | `references/ECSS-M-ST-10C_Rev.1.pdf` |
| ECSS-M-ST-10-01C, *Organization and conduct of reviews* | [ecss.nl](https://ecss.nl/standard/ecss-m-st-10-01c-organization-and-conduct-of-reviews/) | `references/ECSS-M-ST-10-01C.pdf` |
| DGA, *Calque 1618 : activités cyber* (2023) | [armement.defense.gouv.fr](https://armement.defense.gouv.fr/sites/default/files/2023-01/20221028_NP_calque_1618.pdf) | `references/DGA_calque_IM1618_2022.pdf` |
| IM 1618 (2019), conduite des opérations d'armement | [archives.defense.gouv.fr](https://archives.defense.gouv.fr/content/download/556937/9652392/im_1618_-_officielle.pdf) | non obtenue (site injoignable) |
