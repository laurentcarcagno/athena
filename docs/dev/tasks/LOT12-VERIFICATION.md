# Lot 12 : vérification critère par critère (T-0166)

Date : 2026-11-12. Décisions : `docs/dev/DECISIONS/ADR-0006-gestion-de-projet.md`. Plan : `LOT12-PLAN.md`.
Mise à jour du 2026-11-12 : la première vérification (sans e2e, à la demande du demandeur) laissait quatre écarts ; ils sont levés (voir « Écarts » en fin de document) et les critères « non vérifié (e2e) » sont tenus.

Chiffres : API 687 tests, web 536, `packages/ui` 56, `packages/theming` 19, **e2e 69 sur 69** (dont 9 pour le Planning, axe-core avec contraste sur 9 thèmes × 2 modes × 4 écrans), thèmes : 9 thèmes × 2 modes conformes sur 82 paires de contraste, références visuelles : 104 captures (13 écrans × 2 modes × 4 largeurs). Typecheck et lint de design verts.

## Critères du plan

| Tâche | Critère | État | Preuve |
| --- | --- | --- | --- |
| T-0159 | Rôle refusé sur un champ de mauvais type | tenu | `planning-model.test.ts` (création du tracker et ajout d'un champ → 422) |
| T-0159 | Lien créant un cycle → 422 | tenu | `planning-model.test.ts`, `schedule.test.ts` (cycle direct et indirect) |
| T-0159 | Reconstruction depuis `tracker.yaml` conserve les rôles | tenu | `history/reverse-rebuild.test.ts` (GitLab réel) |
| T-0159 | Démonstration NOVA avec dates et liens | tenu, non rejouée | `tools/dev-start.mjs` (syntaxe vérifiée ; amorçage seulement sur une base sans NOVA) |
| T-0160 | Jours ouvrés : week-end, férié, bornes | tenu | `work-calendar.test.ts` |
| T-0160 | Droits admin, lecture par les membres | tenu | `core-http.test.ts` |
| T-0160 | Formulaire du calendrier | tenu | `calendar.test.tsx` |
| T-0161 | Planning de référence exact au jour près | tenu | `schedule-engine.test.ts`, `schedule.test.ts` |
| T-0161 | Marge et chemin critique | tenu | idem |
| T-0161 | Un seul commit GitLab pour N tickets | tenu | `schedule.test.ts` (GitLab réel : même commit pour 2 tickets, `git_sha` des révisions, ticket intact sans commit) |
| T-0161 | 500 tickets + 800 liens < 200 ms | tenu | moteur seul : meilleur de trois < 200 ms (`schedule-engine.test.ts`) ; de bout en bout (lecture en base, calcul, assemblage) : **25 ms** (`schedule-perf.test.ts`) |
| T-0162 | Rendu du Gantt | tenu | `planning-gantt.test.tsx` |
| T-0162 | Redirection `/roadmap` | tenu | `planning.spec.ts` (e2e) |
| T-0162 | Barres positionnées aux bonnes dates | tenu | `planning-gantt.test.tsx` ; `planning.spec.ts` (e2e : x = 48, 96, 144 après replanification) |
| T-0162 | Axe sur le Gantt, 9 thèmes × 2 modes | tenu | `planning.spec.ts` (e2e, contraste compris : Gantt avec chemin critique, Board, Liste, fiche) ; `packages/themes/check.mjs` |
| T-0162 | Rayon des barres = jeton du thème | tenu | `rx: var(--ath-radius-control)` (`views.css`) |
| T-0162 | Fenêtrage à 500 lignes | tenu | `planning-gantt.test.tsx` (moins de 60 lignes dessinées, hauteur exacte) |
| T-0163 | Souris et clavier | tenu | `planning-edit.test.tsx` (glisser, étirer, lier ; flèches, Maj + flèches, Entrée, « Lier à… ») |
| T-0163 | Changer une durée décale les successeurs | tenu | `schedule.test.ts` (édition) |
| T-0163 | Utilisateur sans poignée ni champ modifiable | tenu | `planning-edit.test.tsx` |
| T-0163 | Cycle refusé avec message | tenu | `planning-model.test.ts` ; `planning.spec.ts` (e2e : le message « cycle » s'affiche) |
| T-0164 | Dates figées dans la baseline | tenu | `schedule.test.ts` (instantané ; baseline réelle via GitLab) |
| T-0164 | Calque en pointillés, écart en jours | tenu | `planning-baseline.test.tsx` |
| T-0164 | Aucune information par la couleur seule | tenu | trait épais + mention « Critique » ; pointillés + écart écrit |
| T-0164 | Figer, modifier, comparer | tenu côté API et web ; parcours navigateur de la baseline non joué (l'instance e2e n'a pas de GitLab configuré : `BASELINES` est nul, route 503) | `schedule.test.ts` (GitLab réel), `planning-baseline.test.tsx` |
| T-0165 | Tests ATQL | tenu | `atql-planning.test.ts` |
| T-0165 | Tests web par rôle | tenu | `planning-views.test.tsx` |
| T-0165 | Filtre conservé d'un onglet à l'autre | tenu | `planning-views.test.tsx` ; `planning.spec.ts` (e2e : Gantt → Liste → Board) |
| T-0166 | Captures, axe par thème, e2e complet | tenu | suite e2e complète 69/69 ; références visuelles régénérées après relecture des différences |

## Contrastes vérifiés par thème et par mode (`packages/themes/contract.json`)
Quatre paires ajoutées pour les écrans du lot : chemin critique (`state.danger.fg-aa` sur carte et sur jour non ouvré, 3:1), barre parente sur jour non ouvré (`text.heading` sur `surface.muted`, 3:1), lien et pointillé de baseline (`text.secondary` sur `surface.muted`, 3:1). La première version du Gantt échouait dans neuf combinaisons (progression bleue sur la barre sélectionnée, rouge de bordure sur les jours grisés) : la barre est maintenant sur fond de carte (la progression reprend la paire « série 1 sur carte »), et le rouge du chemin critique et du repère du jour est le rouge de texte `fg-aa`.

## Écarts levés (2026-11-12)
1. **e2e exécutés** : suite complète 69 sur 69 (`pnpm test`). Le projet de dev (ports 3000 et 3001) a été arrêté pour cela.
2. **Références visuelles** : comparaison d'abord (écarts attendus seulement : projet de démonstration VPL dans Projets, Mon travail, Recherche et Administration, onglet Calendrier, nouveaux écrans Planning), puis régénération : `planning` et `planning-liste` sur un projet daté à clé fixe (`VPL`, créé par la spec ; le repère du jour est masqué), à la place de l'écran `roadmap`.
3. **Axe en navigateur** : Gantt (chemin critique), Board, Liste et fiche, 9 thèmes × 2 modes, contraste compris (`planning.spec.ts`).
4. **Écarts reportés, désormais traités** :
   - décalage d'un lien modifiable après création : `PATCH /v1/projects/:p/schedule/links/:id` (administrateur et chef de projet, replanification des successeurs sous un lot), champ dans « Lier à… » ;
   - Gantt tactile : le glisser passe aux événements de pointeur (souris, doigt, stylet), `touch-action: none` sur les barres et poignées ;
   - baselines antérieures sans planning figé : **migration 061**, rattrapage depuis les révisions (dates de la dernière révision de chaque ticket au moment de la baseline), idempotente, testée.

## Constat corrigé en cours de route
La durée d'une tâche parente s'affichait « 0 j » : elle n'a pas de durée propre (dates calculées depuis ses enfants), le tableau et la Liste montrent maintenant « — ».

## Limite connue
Le parcours navigateur de la comparaison à une baseline n'est pas joué : l'instance e2e n'a pas de GitLab configuré. La logique est couverte par les tests d'API (GitLab réel) et de composants.

Le manuel utilisateur (Word, captures) reste à refaire en fin de projet (décision du 2026-11-10).
