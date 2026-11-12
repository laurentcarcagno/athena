# Journal de la tâche T-0162

## Fait
- Rail : la section `roadmap` devient `planning` (`/p/:p/planning`, libellé « Planning ») ; `/p/:p/roadmap` redirige vers `/p/:p/planning?vue=versions`. Lien du tableau de bord et fil d'Ariane mis à jour.
- `PlanningPage` : onglets Gantt (par défaut) et Versions (`?vue=`). Versions = `RoadmapPage` sans second titre (`bare`). Board et Liste viendront en T-0165.
- `ScheduleGantt` : tableau WBS (clé, titre indenté par niveau, début, fin, durée, avancement ; liens vers la fiche) et diagramme SVG en un seul défilement : barres, avancement, parentes en barre fine, jalon en losange, repère du jour, jours non ouvrés grisés (calendrier de l'organisation), liens fin → début en flèches. Dates planifiées (calcul du moteur), pas les dates saisies.
- Fenêtrage au-delà de 80 lignes : lignes d'espacement faites d'un `<svg height>` (aucun style en ligne), hauteur du diagramme exacte.
- `lib/schedule.ts` : types de l'API, jours ouvrés côté navigateur, ordre WBS, axe, plages non ouvrées, fenêtre visible.
- Rayon des barres : `rx: var(--ath-radius-control)` (0 dans Hemeria et Contraste élevé). Aucun dégradé, aucune couleur seule (losange, motif des jours, texte du tableau).
- Tests web : `planning-gantt.test.tsx` (13) ; tests existants adaptés au libellé « Planning ». Web : 492 tests, 1 aléatoire sous charge (`web15`, vert seul).
- e2e écrits : `planning.spec.ts` (rail, barres à x = 48 / 96, redirection, lecture seule, axe 9 thèmes × 2 modes) ; `roadmap.spec.ts`, `themes.spec.ts`, `visuel.spec.ts` adaptés.

## Reste à faire (avant de clore T-0162)
- **Exécuter les e2e** : un Vite (3000) et une API (3001) tournaient pendant la session, Playwright refuse de réutiliser les ports (`reuseExistingServer: false`). Arrêter ces processus, puis `cd e2e && pnpm test` (au minimum `playwright test planning roadmap themes`).
- **Reprendre la référence visuelle** : `cd e2e && pnpm visuel:reference` après relecture (l'écran `roadmap` devient `planning`, 96 captures).

## Décisions et pièges
- Le projet ARI (captures) n'a aucune tâche datée : l'écran `planning` y montre l'état vide. Les barres sont couvertes par `planning.spec.ts` (projet créé à la volée).
- L'id de section `planning` existait déjà comme module serveur (ancienne Planification) ; la section est non gardée (`gated: false`), sans effet.
- Le Gantt lit `GET /schedule` et `GET /v1/calendar` ; un utilisateur sans accès au calendrier voit la semaine lundi–vendredi par défaut.

## Prompt de reprise
Lire `docs/dev/STATE.md`, `docs/dev/tasks/T-0162/CONTEXT.md` (e2e et références visuelles à faire), puis T-0163 (édition par le chef de projet).
