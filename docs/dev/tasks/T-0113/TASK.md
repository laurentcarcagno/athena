# T-0113 : relations groupées, retour à l'origine, précédent et suivant (Lot 9, C2)

Plan : `docs/dev/tasks/LOT9-PLAN.md`. Spécification : `docs/dev/SPEC_IHM.md` § « Vue Item » (onglet Liens, J / K).

## Objet
1. Onglet Liens : les relations sont groupées (parent, enfants, bloque, est bloqué par, duplique, traçabilité, relié à).
2. La fiche connaît son origine (liste ou ticket) : « Retour », puis, depuis une liste, précédent et suivant avec la position.

## Décisions
- Le groupe d'un lien se déduit des propriétés de son type, sans liste de clés en dur, sauf `blocks` et `duplicates` :
  - hiérarchique : sortant = Parent, entrant = Enfants ;
  - `blocks` : Bloque ou Est bloqué par ;
  - `duplicates` : Duplique ;
  - le type propage la suspicion : Traçabilité ;
  - le reste : Relié à.
  L'API expose `LinkView.propagatesSuspect`.
- L'origine passe dans l'état de navigation (`lib/origin.ts`) et non dans l'adresse : celle-ci reste partageable et l'état survit au rechargement. L'origine se chaîne (liste › A › B) : le retour de B vers A rend à A sa propre origine. La chaîne est bornée à 5 niveaux, et une adresse externe est refusée.
- Les listes qui transmettent une origine :
  - Recherche (`ArtifactTable` avec `origin`) ;
  - écran Tracker (« Agrandir » : le retour rouvre la liste avec ses filtres et son panneau) ;
  - Mon travail (précédent et suivant parcourent les tickets du même projet) ;
  - Board ;
  - liens et informations clés de la fiche (origine = le ticket).
- Précédent et suivant gardent l'onglet ; J / K les déclenchent sur la page (le panneau garde ses propres J / K).
- La navigation d'origine se place sous l'en-tête collant, qui la recouvrirait sinon une fois la page défilée.

## Critères d'acceptation (testables)
- [x] Les relations s'affichent par groupe, dans l'ordre, titrées et comptées, sans groupe vide.
- [x] Saut vers un ticket lié en 1 action, puis retour en 1 action, avec l'origine du premier ticket.
- [x] Depuis une liste : « Retour : <liste> » en 1 action (filtres conservés), position « n / N », précédent et suivant (boutons, J / K).
- [x] Changer d'onglet ne perd pas l'origine ; précédent et suivant gardent l'onglet.
- [x] Sans origine (adresse saisie, nouvel onglet), ni retour ni précédent.
