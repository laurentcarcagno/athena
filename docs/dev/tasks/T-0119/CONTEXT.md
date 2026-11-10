# T-0119 : page Recherche globale et palette (Lot 9, G2)

Critère : trouver un ticket par clé depuis n'importe où en ≤ 2 actions.

## Fait (2026-11-10)
- `pages/GlobalSearchPage.tsx` (`/recherche`) : tickets de tous les projets autorisés (`GET /v1/search`), tableau clé (lien avec origin `fromHere`), titre, projet, tracker, statut ; pagination par 50.
  - Puces « Mes tickets » (`assignee = "<utilisateur>"`), « Ouverts » (`category != done`), « Modifiés depuis 7 jours » (`updated > daysAgo(7)`) : boutons `aria-pressed` qui écrivent dans la requête ATQL (`toggleClause`), seule source de vérité.
  - Périmètre de projets en puces (`p=A,B` dans l'adresse), saisie ATQL libre, vues enregistrées personnelles (`/v1/searches`) : appliquer, enregistrer, supprimer avec confirmation.
- Palette (`CommandPalette`) : cherche les tickets dans tous les projets (`/v1/search`), même hors projet ; la clé exacte arrive en tête, avant la navigation ; actions « Créer un ticket… » (cible déduite de l'adresse) et « Rechercher « … » dans tous les projets » ; entrée « Recherche globale ».
- Rail global : entrée « Recherche » (`/recherche`), après Mon travail.
- Tests : `global-search-page.test.tsx` (5, axe compris) ; `navigation.test.tsx` : Ctrl+K puis la clé et Entrée, depuis un projet et depuis Mon travail ; `web2`, `web11` mis à jour ; e2e `recherche.spec.ts`.

## Décisions et pièges
- 2 actions : (1) Ctrl+K, (2) saisir la clé et valider. L'action « Rechercher « clé »… » contient aussi la clé : les tests vérifient que la première option **commence** par la clé.
- Ouvrir la palette en e2e : attendre que la page soit prête (titre visible), sinon Ctrl+K part dans le vide.
- La puce « Mes tickets » suppose le champ `assignee` (convention des gabarits), comme la puce du tracker.
- Le rail global compte maintenant 7 entrées pour un administrateur (Favoris, Récents, Projets, Mon travail, Recherche, Organisation, Aide) : T-0123 doit ramener à ≤ 6.

## Prompt de reprise
T-0120 (Paramètres et redirections).
