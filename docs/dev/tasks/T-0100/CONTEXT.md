# Journal de la tâche T-0100

## Fait
- Organisation > Types : liste (catégorie, vues, état livré/modifié), création, modification (clé verrouillée), suppression et réinitialisation avec confirmation (`TrackerTypesTab`).
- Éditeur de tracker : champ « Type de tracker » (le choix ajoute le socle sans doubler un champ ou un rôle déjà présent ; détacher n'enlève rien) ; la création envoie `typeKey` (route de création acceptant `typeKey`).
- Page de configuration d'un tracker : sélecteur de type (`PATCH …/type`).
- i18n FR/EN, guide utilisateur.
- Tests : `web8.test.tsx` (6 tests dont axe).

## Reste à faire
- Affichage de la catégorie sur la carte des trackers : T-0054 (`categoryLabel` exporté).

## Décisions et pièges
- Les catégories sont affichées en français via `fr.types.categories` (clés anglaises dans les données).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0053 (coquille de projet et onglets).
