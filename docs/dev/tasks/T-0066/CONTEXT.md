# Journal de la tâche T-0066

## Fait
- API : `TreeService` / `TreeController` (`GET …/trackers/:t/tree`), un niveau par appel, convention enfant → parent, parents multiples, titres restreints, aucune migration ; `tree.test.ts` (7).
- Web : `TreeView` (ARIA `tree`, tabindex itinérant, chapitres, chargement au dépliage, panneau de détail via `?i=`), vue `arbre` dans `TRACKER_VIEWS`/`viewsFor` ; `web14.test.tsx` (5), e2e `arbre.spec.ts`.
- **Défaut corrigé au passage (introduit en T-0054)** : la barre d'état des cartes de trackers utilisait un `style` en ligne, que la CSP de production (`style-src 'self'`) bloque ; elle est dessinée en SVG. Garde-fou `guards.test.ts` : aucun `style={…}` dans le code web.
- E2E : la limite de débit de l'API (600 requêtes/minute et par adresse) était atteinte par la suite complète depuis une seule adresse ; relevée à 6000 dans la configuration de test uniquement.

## Décisions
- Un tracker sans type propose maintenant Tableau, Board et Arbre ; un type ne propose que ce qu'il déclare.
- La numérotation est calculée par le client, place par place (un item à deux parents a deux numéros).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0067 (vue Matrice).
