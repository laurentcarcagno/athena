# Journal de la tâche T-0154

## Fait
- « Organiser » remplace « Personnaliser » : consigne en tête ; chaque carte a une poignée ⠿ (glisser-déposer HTML ; au clavier : Entrée ou Espace saisit, flèches déplacent, Entrée ou Échap posent ; annonces pour les lecteurs d'écran ; le focus reste sur la poignée), un choix de largeur S / M / L / XL, « Dupliquer » (recherches) et « Masquer ». Case « + Ajouter une carte » au bout de la grille (cartes masquées, recherches enregistrées). « Rétablir la disposition par défaut » (avec confirmation) et « Terminer ».
- Même moteur pour toutes les pages : `Dashboard` reçoit `page` (portée `CLÉ:avancement` côté API) ; l'Avancement l'utilise en T-0155.
- Défaut corrigé en passant : deux gestes rapprochés (déplacer puis élargir) faisaient revenir la largeur, la réponse du premier enregistrement écrasant le second ; seule la réponse du dernier enregistrement s'applique désormais.
- Tests : web 472/472 (clavier, glisser-déposer, largeur, ajout, retour au défaut, axe en mode Organiser) ; e2e `tableau-de-bord` (clavier, rechargement) et `ergonomie` (souris, largeur, rechargement) verts.

## Décisions et pièges
- Les e2e lancés directement (`npx playwright test`) utilisent l'API compilée : après un changement d'API, `pnpm --filter @athena/api build` (`pnpm test` le fait).
- Un `getByRole('group', { name: 'Récents' })` trouve aussi le menu Récents du rail et le groupe de largeur : cibler la carte par `.ath-dashcard[aria-label=…]`.
