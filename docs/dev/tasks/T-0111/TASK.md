# T-0111 : création contextuelle (Lot 9, lot B)

- **Objectif** : créer un ticket depuis n'importe quel écran, pré-rempli par le contexte, sans quitter la page (ADR-0003 § 2.5).
- **Critères d'acceptation** (testables) :
  1. `CreateTarget` (union : globale, projet, tracker) est déduite de l'adresse par `targetOf` : tracker sur l'écran Tracker, sa configuration et une fiche ; projet ailleurs dans un projet ; globale hors projet.
  2. « Créer » dans la barre haute et la touche `N` (ignorée pendant une saisie, avec modificateur ou sous un dialogue) ouvrent la création de la cible de la page.
  3. En portée globale on choisit le projet puis le tracker ; dans un projet, le tracker ; dans un tracker, il est pré-choisi.
  4. Après création, on reste sur la page. Le message « <clé> créé. » propose « Ouvrir <clé> » et reste affiché jusqu'à sa fermeture. L'écran Tracker recharge sa liste et ouvre le ticket dans le panneau ; la Recherche recharge sa liste.
  5. Créer un ticket demande au plus 3 actions depuis n'importe quel écran (ouvrir, remplir, Créer).
- **Fichiers concernés** : `lib/create-target.ts` (nouveau), `components/CreateArtifact.tsx`, `App.tsx`, `pages/tracker/TrackerScreen.tsx`, `pages/ListPage.tsx`, `i18n.ts`, `packages/ui/src/components.tsx` (action des messages), `styles.css`, tests.
- **Hors périmètre** : création dans une colonne du board (T-0114), libellé « Ticket » partout (T-0124).
- **Dépendances** : T-0109.
