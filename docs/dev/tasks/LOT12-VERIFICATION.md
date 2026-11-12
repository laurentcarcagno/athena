# Lot 12 : vérification critère par critère (T-0166)

Date : 2026-11-12. Décisions : `docs/dev/DECISIONS/ADR-0006-gestion-de-projet.md`. Plan : `LOT12-PLAN.md`.
Consigne du demandeur pour cette série : **aucun test e2e** exécuté. Les critères qui exigent un navigateur réel sont marqués « non vérifié (e2e) » : ce sont les écarts ouverts du lot.

Chiffres : API 684 tests, web 534, `packages/ui` 56, `packages/theming` 19, thèmes : 9 thèmes × 2 modes conformes sur 82 paires de contraste. Typecheck et lint de design verts.

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
| T-0162 | Redirection `/roadmap` | écrite dans le routage, non vérifiée (e2e) | `App.tsx` ; `planning.spec.ts` écrit |
| T-0162 | Barres positionnées aux bonnes dates | tenu en test de rendu (x = 48, 96…), non vérifié (e2e) | `planning-gantt.test.tsx` ; `planning.spec.ts` écrit |
| T-0162 | Axe sur le Gantt, 9 thèmes × 2 modes | **partiel** : axe-core hors contraste en jsdom (aucune violation) ; contrastes des jetons utilisés vérifiés sur 9 thèmes × 2 modes (voir plus bas) ; axe complet en navigateur non vérifié (e2e) | `planning-*.test.tsx`, `packages/themes/check.mjs` |
| T-0162 | Rayon des barres = jeton du thème | tenu | `rx: var(--ath-radius-control)` (`views.css`) |
| T-0162 | Fenêtrage à 500 lignes | tenu | `planning-gantt.test.tsx` (moins de 60 lignes dessinées, hauteur exacte) |
| T-0163 | Souris et clavier | tenu | `planning-edit.test.tsx` (glisser, étirer, lier ; flèches, Maj + flèches, Entrée, « Lier à… ») |
| T-0163 | Changer une durée décale les successeurs | tenu | `schedule.test.ts` (édition) |
| T-0163 | Utilisateur sans poignée ni champ modifiable | tenu | `planning-edit.test.tsx` |
| T-0163 | Cycle refusé avec message | tenu côté API (422 qui nomme les tâches) ; l'affichage passe par `useFailure`, non vérifié (e2e) | `planning-model.test.ts` |
| T-0164 | Dates figées dans la baseline | tenu | `schedule.test.ts` (instantané ; baseline réelle via GitLab) |
| T-0164 | Calque en pointillés, écart en jours | tenu | `planning-baseline.test.tsx` |
| T-0164 | Aucune information par la couleur seule | tenu | trait épais + mention « Critique » ; pointillés + écart écrit |
| T-0164 | Figer, modifier, comparer (e2e) | non vérifié (e2e) | couvert côté API par `schedule.test.ts` |
| T-0165 | Tests ATQL | tenu | `atql-planning.test.ts` |
| T-0165 | Tests web par rôle | tenu | `planning-views.test.tsx` |
| T-0165 | Filtre conservé d'un onglet à l'autre | tenu en test, non vérifié (e2e) | `planning-views.test.tsx` |
| T-0166 | Captures, axe par thème, e2e complet | **non fait (consigne : pas d'e2e)** | voir écarts |

## Contrastes vérifiés par thème et par mode (`packages/themes/contract.json`)
Quatre paires ajoutées pour les écrans du lot : chemin critique (`state.danger.fg-aa` sur carte et sur jour non ouvré, 3:1), barre parente sur jour non ouvré (`text.heading` sur `surface.muted`, 3:1), lien et pointillé de baseline (`text.secondary` sur `surface.muted`, 3:1). La première version du Gantt échouait dans neuf combinaisons (progression bleue sur la barre sélectionnée, rouge de bordure sur les jours grisés) : la barre est maintenant sur fond de carte (la progression reprend la paire « série 1 sur carte »), et le rouge du chemin critique et du repère du jour est le rouge de texte `fg-aa`.

## Écarts ouverts
1. **Exécuter les e2e** : `cd e2e && pnpm test` (au minimum `planning`, `roadmap`, `themes`) quand les ports 3000 et 3001 sont libres.
2. **Références visuelles** : `pnpm visuel:reference` après relecture (l'écran `roadmap` devient `planning`). Le projet ARI n'a pas de tâche datée : prévoir un projet de démonstration (NOVA) pour une capture parlante.
3. **Axe en navigateur** sur le Gantt, la Liste et le Board (9 thèmes × 2 modes) : `planning.spec.ts` couvre le Gantt ; Board et Liste à ajouter avec un projet daté.
4. **Reporté, hors lot** : décalage d'un lien modifiable après création (retirer puis recréer) ; Gantt tactile (glisser à la souris seulement : durée, clavier et « Lier à… » restent) ; baselines antérieures sans planning figé.

Le manuel utilisateur (Word, captures) reste à refaire en fin de projet (décision du 2026-11-10).
