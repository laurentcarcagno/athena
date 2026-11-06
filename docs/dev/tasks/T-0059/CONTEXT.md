# Journal de la tâche T-0059

## Fait
- `ArtifactPage` découpée : `ArtifactView` (fiche complète ou panneau, prop `embedded`, `onExpand`, `onClose`, `onCanonicalKey`) et `ArtifactPage` (route). La clé change → l'état est remis à zéro (pas de contenu périmé).
- `DetailPanel` (`<aside aria-label>`, focus à l'ouverture seulement) ; `TrackerScreen` : `?i=<clé>`, mise en page `ath-split` (panneau fixe plein écran sous 768 px), J / K (ignorés en saisie, avec modificateur ou si une boîte de dialogue est ouverte), Échap, rendu de la ligne sélectionnée (`aria-current`, classe).
- `ArtifactTable` : `selected`, `id="row-<clé>"` pour rendre le focus.
- Tests : `web10.test.tsx` (7 tests de plus : ouverture, adresse, J / K, saisie, Échap, Agrandir, Fermer, axe).

## Reste à faire
- Aide intégrée : les raccourcis J / K / Échap sont documentés dans le guide ; l'aide-mémoire `?` de la spécification arrivera avec les finitions (T-0096).
- Les raccourcis `E` `C` `L` `T` de la fiche (spécification) ne sont pas dans cette tâche.

## Décisions et pièges
- `queryByRole('complementary')` trouve aussi la barre latérale : nommer le panneau dans les tests.
- Le panneau reste dans la page : un `fixed` plein écran sous 768 px suffit tant que le rail mobile (F-09) n'est pas refait.

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0060 (rail contextuel, favoris et récents ; migration à numéroter).
