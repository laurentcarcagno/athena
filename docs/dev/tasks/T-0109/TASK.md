# T-0109 : coquille projet unique (Lot 9, lot A)

- **Objectif** : le projet et sa navigation restent visibles sur toutes les routes `/p/:projet/*` ; une seule définition des sections ; la navigation du projet est dans le rail (ADR-0003 § 2.3).
- **Critères d'acceptation** (testables) :
  1. `lib/navigation.ts` définit les sections dans l'ordre fixe, avec module et accès par rôle ; `visibleSections(modules, roles)` filtre sans réordonner ; liste de modules inconnue : toutes les sections autorisées.
  2. Toute route `/p/:p/*` (écran Tracker, fiche, board, recherche, administration, configuration et création de tracker) est enfant d'un `ProjectLayout` et affiche la rubrique « Projet <clé> » du rail.
  3. La rubrique liste les sections visibles ; les trackers sont imbriqués sous « Trackers », et les vues partagées sous le tracker ouvert.
  4. L'entrée courante est signalée (`aria-current`) : la section de la page ; le tracker sur l'écran Tracker, la fiche (clé canonique) et la configuration du tracker.
  5. Un utilisateur sans rôle ne voit ni Planification, ni Membres, ni Administration ; l'assurance qualité voit Planification ; un chef de projet voit Planification et Membres.
  6. Les onglets horizontaux du projet sont supprimés ; aucune URL ne change ; les redirections existantes restent.
- **Fichiers concernés** : `apps/web/src/lib/navigation.ts` (nouveau), `components/Rail.tsx`, `pages/project/ProjectShell.tsx`, `App.tsx`, `web9.test.tsx`, `navigation.test.tsx`, `lib/navigation.test.ts` (nouveau).
- **Hors périmètre** : sections nouvelles (Backlog, Board, Roadmap, Rapports, Paramètres), mobile (T-0110), libellés (T-0124).
- **Dépendances** : ADR-0003.
