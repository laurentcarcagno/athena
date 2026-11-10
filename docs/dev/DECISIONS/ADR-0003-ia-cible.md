# ADR-0003 : architecture de l'information cible (Lot 9)

Statut : accepté (2026-11-10). Amende l'ADR-0002 (§ 3, routes et onglets) et `docs/dev/SPEC_IHM.md` (navigation, vue Projet, terminologie). Plan d'exécution : `docs/dev/tasks/LOT9-PLAN.md`.

## 1. Contexte

L'audit de navigation du 2026-11-10 relève cinq problèmes majeurs :
1. le projet et sa navigation disparaissent sur les écrans de travail (Tracker, fiche, board, recherche, administration, configuration), qui sont hors de la coquille `ProjectShell` ;
2. aucun backlog ni planification de sprint dans l'interface, alors que l'API sait rattacher des items aux sprints et aux versions ;
3. aucune création globale ou contextuelle, et la création remplace la liste par la page complète ;
4. la recherche ne dépasse pas le projet courant et n'offre que l'ATQL ;
5. l'administration est dispersée et mélange les niveaux (webhooks et plugins d'organisation dans l'administration du projet, baselines en deux endroits, onglets visibles menant à « Réservé »).

## 2. Décisions (réponses du demandeur, 2026-11-10)

1. **Terme « Ticket »** pour l'élément de travail, dans toute l'interface (« Nouveau ticket », « un ticket »). Il remplace « Item » (SPEC_IHM) et « Artefact ». Les URL (`/a/:clé`), l'API, l'ATQL et le stockage ne changent pas.
2. **Trois niveaux** : Global › Projet › Ticket. Le projet compte 8 sections, dans cet ordre : Vue d'ensemble, Backlog, Board, Trackers, Roadmap, Documents, Rapports, Paramètres.
   - Rapports : Avancement, Traçabilité, Conformité, Livraison (code, DORA), Activité.
   - Paramètres : Membres, Trackers, Boards, Automatisations, Baselines, Approbations.
   - Les webhooks et les plugins rejoignent l'Administration de l'organisation.
3. **La navigation du projet est dans le rail**, sur toutes les routes `/p/:projet/*`. Les onglets horizontaux du projet sont supprimés. Sur mobile, un sélecteur de section les remplace. Cela réalise ce que demandait déjà `SPEC_IHM.md` (« dessous, le projet courant avec ses onglets fixes ») et ne contredit pas le commentaire 53 du Lot 8 : il s'agissait de retirer un *doublon* des onglets, et il n'y a plus d'onglets.
4. **Accueil = « Mon travail », tableau de bord personnel configurable, initialisé par défaut** :
   - widgets par défaut : Mes tickets, À approuver, Mentions, Échéances de la semaine, Projets favoris, Récents ;
   - personnalisation encadrée : masquer, réordonner, dupliquer, ajouter un widget depuis une vue enregistrée, réinitialiser ; la grille reste fixe ;
   - chaque widget mène à sa liste complète (`/recherche?q=…`) ;
   - le même moteur sert la Vue d'ensemble du projet, initialisée depuis le gabarit du projet ;
   - une préférence de profil permet de choisir un projet comme page d'accueil.
5. **Après une création, on reste sur la page** : un message porte le lien « Ouvrir <clé> » et, dans une liste, le ticket s'ouvre dans le panneau de détail.
6. **Backlog** : alimenté par les trackers de type Tâche. Le rang du backlog est une donnée nouvelle ; les migrations sont libres (aucune donnée réelle). Des projets et des trackers de démonstration sont ajoutés au démarrage de développement.
7. **Recherche globale** : nouvelle route `GET /v1/search` (ATQL d'organisation, filtrée par les droits et la RLS). `/p/:projet/recherche` devient la même page, pré-filtrée sur le projet.
8. **Lot 9 ouvert.** Les règles de changement de lot de `STATE.md` s'appliquent.

## 3. Routes cibles

| Adresse | Contenu | Origine |
| --- | --- | --- |
| `/` | Mon travail (tableau de bord personnel) | ancien `/me` (redirigé) |
| `/projets` | Projets | ancien `/` |
| `/recherche` | Recherche globale | nouvelle |
| `/notifications`, `/profil` | Notifications, Profil | nouvelles |
| `/admin` | Administration de l'organisation | ancien `/org` (redirigé) |
| `/p/:p` | Vue d'ensemble | inchangée |
| `/p/:p/backlog`, `/board[/:board]`, `/roadmap` | Sections nouvelles | `/board/:board` conservé |
| `/p/:p/trackers`, `/t/:t/:vue`, `/a/:clé` | inchangées ; la fiche prend `?onglet=` | |
| `/p/:p/rapports/:r` | avancement, tracabilite, conformite, livraison, activite | `/tracabilite`, `/conformite`, `/code`, `/activite` redirigés |
| `/p/:p/parametres/:s` | membres, trackers, boards, automatisations, baselines, approbations | `/admin`, `/membres`, `/planification`, `/trackers/:t/config` redirigés |

Les redirections sont permanentes dans le code et ne sont jamais supprimées (règle de l'ADR-0002 § 3).

## 4. Règles d'interface

- Une seule définition des sections de projet (`apps/web/src/lib/navigation.ts`). Le rail, le fil d'Ariane et le sélecteur mobile la lisent.
- Une section n'apparaît que si sa page existe, si son module est actif et si le rôle de l'utilisateur y donne accès. Aucune entrée visible ne mène à « Réservé ».
- Pendant la transition, les pages existantes (Planification, Traçabilité, Conformité, Code, Activité, Membres, Recherche, Administration) restent des entrées du rail. Elles disparaissent quand Rapports et Paramètres sont livrés. Le rail peut donc compter temporairement plus de 9 entrées de projet.
- États d'écran uniformes (`Loadable`) : chargement, prêt, vide, erreur, interdit, hors ligne.
- Glossaire : Projet, Ticket, Tracker, Backlog, Board, Sprint, Version, Roadmap, Rapports, Documents, Paramètres (projet), Administration (organisation), Gabarit, Membre, Responsable. Verbes : Créer (nouvel objet), Ajouter (rattacher l'existant), Retirer (détacher), Supprimer (détruire, avec confirmation).

## 5. Conséquences

- `SPEC_IHM.md` reste la référence fonctionnelle. Sur la navigation, la vue Projet et la terminologie, la présente ADR prime.
- Les tests qui visaient la barre d'onglets du projet visent désormais la rubrique « Projet » du rail.
- Le manuel utilisateur (`docs/user`) et ses captures sont à refaire en fin de lot (T-0124).
