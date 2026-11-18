# ADR-0010 : gabarits de tableaux de bord (lot 27)

Statut : accepté (2026-11-18), propositions validées par l'utilisateur via le formulaire de revue (41 fiches validées, 1 à revoir, corrigée en R2). Plan d'exécution : `docs/dev/tasks/LOT27-PLAN.md`. Complète ADR-0005 (grille, cartes) et ADR-0007 (tableau de bord modulaire, onglets en migration 093).

## 1. Contexte

Tous les tableaux de bord sont vides par défaut (décision du 2026-11-18). Chacun compose les siens avec « Organiser ». L'administrateur doit pouvoir proposer des points de départ par rôle, par nature de projet et par rôle dans le projet, sans imposer de disposition.

## 2. Décisions

1. **P1, forme d'un gabarit.** Un gabarit vise un seul type de tableau de bord (`home` : Mon travail, `project` : vue d'ensemble, `progress` : avancement, `portfolio`). Il compte de 1 à 9 onglets nommés, chacun avec ses cartes sur la grille de 12 colonnes. Il porte une cible : rôles Athena, natures de projet, rôle dans le projet (listes vides = tous).
2. **P2, livrés et organisation.** Les gabarits livrés sont décrits dans le code (`apps/api/src/core/dashboard-templates/`) et ne se modifient pas. L'organisation les masque (`dashboard_template_hidden`) ou les duplique en gabarits d'organisation (`dashboard_template`), modifiables par l'administrateur seul. Une clé livrée est réservée.
3. **P3, administration.** Organisation › Gabarits › Tableaux de bord : liste filtrable, éditeur fondé sur l'éditeur de grille d'« Organiser », aperçu « voir comme » sans enregistrement.
4. **P4, application.** Dans « Organiser », « Partir d'un gabarit » propose les gabarits applicables et les **copie**, soit en ajoutant ses onglets (au plus 8 onglets nommés au total), soit en remplaçant le tableau de bord. Aucun lien ne subsiste : une modification ultérieure du gabarit ne touche pas les copies.
5. **P5, défaut.** L'administrateur désigne, par type et par rôle, un gabarit par défaut (`dashboard_template_default`). Tant que la personne n'a rien enregistré dans la portée, la première lecture applique ce gabarit à son tableau de bord (copie, comme P4) ; ensuite elle est chez elle. « Rétablir » supprime ses réglages et le défaut s'applique de nouveau. À la livraison : aucun défaut, tableaux vides.
6. **P6, plusieurs rôles.** Union des gabarits des rôles de la personne. Pour le défaut : administrateur, PMO, directeur, chef de projet, responsable d'équipe, finance, assurance produit, membre d'équipe, le premier rôle qui a un défaut l'emporte.
7. **P7, cartes relatives.** Une carte de gabarit ne porte aucune clé de projet ou de portefeuille. À l'application : dans un gabarit de projet, elle prend le projet courant ; dans un gabarit de portefeuille, le portefeuille courant ; dans Mon travail, une carte `repeat: 'project'` (ou `'portfolio'`) est répétée pour chaque projet dont la personne est chef (à défaut, membre), ou chaque portefeuille visible. Au plus 24 cartes par onglet : le surplus est écarté et signalé. Les requêtes ATQL portent sur les **types** de tracker.
8. **P8, nature du projet.** Déduite du gabarit normatif du projet (en remontant les héritages) : `space-software` (spatial), `space-project` (spatial-project), `defense-software` (defense), `armament` (armement-1618), `generic` sinon.
9. **P9, rôle dans le projet.** `manager` (chef du projet), `member`, sinon `reader`. Un gabarit de projet peut cibler un ou plusieurs de ces rôles ; aucun gabarit n'est attribué à une personne nommée.
10. **P10, droits.** Un gabarit n'accepte que des cartes permises à chacun des rôles qu'il cible, et ne contient que des cartes dont le genre convient à son type. Les données restent filtrées par les droits de la personne qui regarde (listes d'ayants droit, chef de projet limité à ses projets).
11. **P11, portées élargies.** Les cartes de portefeuille se posent aussi dans Mon travail (avec le portefeuille en réglage). Un tableau de bord de portefeuille accepte, en plus de ses cartes, les cartes de recherche, les graphiques et les cartes à double portée (charge, feuille de route, risques). Le rôle finance lit les portefeuilles (lecture seule) et les tableaux de bord de portefeuille.
12. **R1.** Les cartes Favoris et Récents n'entrent dans aucun gabarit livré (déjà au rail) ; elles restent au catalogue.
13. **R2.** Le gabarit livré Contributeur compte deux onglets : « Aujourd'hui » (avec « Mes anomalies ») et « À prendre ».

## 3. Genres de cartes ajoutés (N1 à N9)

`portfolio-finance`, `project-finance`, `capacity`, `roadmap`, `phase-gate`, `portfolio-gates`, `portfolio-requests`, `risk-matrix`, `platform-ops`. Elles lisent les routes existantes des modules PPM et de l'administration (aucune donnée nouvelle) ; seule la matrice des risques d'un projet ajoute une route. Elles ont un état de chargement, vide et d'erreur, et leur droit de lecture est celui de la page correspondante.

## 4. Conséquences

- Le modèle de widget gagne `portfolio` et, dans un gabarit, `repeat`.
- La validation d'une disposition accepte les cartes de portefeuille hors portefeuille (P11) ; elle refuse dans un portefeuille les cartes de projet.
- Hors périmètre : gabarit nommé par personne, mise à jour des copies, partage entre personnes, réordonnancement des onglets au glisser-déposer.
