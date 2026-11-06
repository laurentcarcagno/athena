# Journal de la tâche T-0056

## Fait
- `ArtifactTable` extrait de `ListPage` (tableau triable + pagination, `linkFor` pour que le panneau de détail remplace le lien en T-0059) ; `pillKind` y vit désormais (réexporté par `ListPage`).
- `MiniWorkflow` : états dans l'ordre avec compteurs, filtre par clic (`aria-pressed`).
- `TrackerScreen` : `/p/:projet/t/:tracker/:vue` (en-tête, préfixe en mono, total, « + Nouvel item » sur ce tracker, Configurer pour les administrateurs, barre de vues, Tableau). État (`s`, `sort`, `o`) dans l'adresse. `/t/:tracker` et une vue inconnue redirigent vers `tableau`.
- Les liens de trackers (cartes, tableau de bord, page Projets) pointent vers l'écran Tracker.
- Tests : `web10.test.tsx` (8 tests dont axe).

## Reste à faire
- Barre de filtres en puces et vues enregistrées (T-0057), Board (T-0058), panneau de détail (T-0059).

## Décisions et pièges
- La requête du Tableau est construite côté client (`tracker = KEY [AND status = s] [ORDER BY …]`) ; la clé de tracker est validée par le routeur et le serveur (ATQL paramétré).

## Prompt de reprise
Lire `docs/dev/STATE.md`, puis T-0057 (filtres, bascule ATQL, vues enregistrées ; migration à numéroter).
