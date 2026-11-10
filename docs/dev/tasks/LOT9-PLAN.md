# Lot 9 : architecture de l'information (2026-11-10)

Décisions : `docs/dev/DECISIONS/ADR-0003-ia-cible.md`. Audit d'origine : navigation, parcours et libellés (étude du 2026-11-10, résumée dans l'ADR § 1).
Règle : une tâche par session, dans l'ordre ci-dessous ; arrêt et compte rendu en fin de lot ; aucun écart toléré sans accord explicite.

## Tâches

| Tâche | Lot | Objet | Critères d'acceptation |
| --- | --- | --- | --- |
| T-0109 | A | Coquille projet unique : `lib/navigation.ts` (sections, accès, modules), `ProjectLayout` parent de toutes les routes `/p/:p/*`, rubrique « Projet » du rail = sections visibles, trackers imbriqués, onglets horizontaux supprimés | Toute route `/p/:p/*` affiche la navigation du projet ; l'entrée courante est signalée (fiche et configuration : le tracker) ; aucune entrée visible ne mène à « Réservé » ; aucune URL changée |
| T-0110 | A2 | Mobile : sélecteur de section dans l'en-tête de projet, barre basse globale | À 390 px : aucune navigation sur plusieurs lignes, aucun défilement horizontal ; cibles ≥ 44 px |
| T-0111 | B | Création contextuelle : `CreateTarget` déduit de l'URL, « + Créer » dans la barre haute (touche `C`), choix du projet en portée globale, on reste sur la page (message « Ouvrir », panneau dans les listes) | Créer un ticket en ≤ 3 actions depuis n'importe quel écran ; la liste et ses filtres restent en place |
| T-0112 | C1 | Fiche : découpage de `ArtifactPage` (`ItemHeader`), en-tête complet (responsable, priorité, échéance, version, sprint, parent, blocage), onglet dans l'URL (`?onglet=`) | Bouton Précédent : l'onglet est restauré ; informations clés visibles sans clic |
| T-0113 | C2 | Relations groupées (parent, enfants, bloque, est bloqué par, duplique, relié à, traçabilité), retour à la liste d'origine, précédent et suivant | Saut entre tickets liés en 1 action, puis retour en 1 action |
| T-0114 | D | Board : carte enrichie (type, priorité, échéance, responsable lisible, bloqué), clic = panneau, filtre rapide dans l'URL, création par colonne, index `/p/:p/board` | Board › ticket › retour en 1 action, filtres conservés ; « Déplacer vers » au clavier conservé |
| T-0115 | E1 | Backlog, côté API : rang des tickets de type Tâche (migration), routes de lecture et de réordonnancement ; données de démonstration (projets, trackers Tâche, sprints) dans le démarrage de développement | Tests d'API : ordre stable, droits, RLS |
| T-0116 | E2 | Page Backlog : backlog ordonné, sprints à venir et actif, ajouter ou retirer, démarrer, clore (reste au backlog ou au sprint suivant), burndown | Un sprint se planifie sans quitter la page, au clavier compris |
| T-0117 | F | Roadmap : versions, progression, ajout de tickets à une version, publication | Avancement d'une version en 1 clic depuis le rail |
| T-0118 | G1 | API `GET /v1/search` : ATQL d'organisation, filtre par projet, droits et RLS | Un ticket d'un projet non autorisé n'apparaît jamais |
| T-0119 | G2 | Page Recherche globale (filtres rapides en puces, ATQL, vues enregistrées), palette sur tous les projets avec actions (« Créer… ») | Trouver un ticket par clé depuis n'importe où en ≤ 2 actions |
| T-0120 | H1 | Paramètres : `/p/:p/parametres/:s` ; webhooks et plugins vers l'Administration ; redirections `/admin`, `/membres`, `/planification`, `/trackers/:t/config` | Toute ancienne URL mène à la nouvelle page ; aucune page de projet ne règle un objet global |
| T-0121 | H2 | Rapports : `/p/:p/rapports/:r` ; redirections `/tracabilite`, `/conformite`, `/code`, `/activite` | Idem ; rail du projet ≤ 9 entrées |
| T-0122 | I1 | Tableau de bord configurable : disposition par utilisateur (migration, API), moteur de widgets fondés sur des vues enregistrées, disposition par défaut | Disposition par défaut sans réglage ; masquer, réordonner, dupliquer, réinitialiser |
| T-0123 | I2 | Global : `/` = Mon travail sur le moteur, `/projets`, `/profil` (langue, thème, notifications, accueil), `/notifications`, `/org` → `/admin` ; Vue d'ensemble du projet sur le moteur | Rail global ≤ 6 entrées ; redirections testées |
| T-0124 | J | Libellés : glossaire de l'ADR-0003 (Ticket, Version, Gabarit…) dans `i18n.ts`, test de vocabulaire, mise à jour de `docs/user` | Le test échoue si « artefact », « release » ou « template » restent dans les textes français affichés |
| T-0125 | — | Vérification du lot critère par critère (`LOT9-VERIFICATION.md`), e2e rejoués | Tous les critères tenus ou écart accepté explicitement |
