# Lot 16 : vérification

Tests ciblés exécutés le 2026-11-14 (aucun e2e, aucune référence visuelle, aucun axe navigateur).

| Critère | Preuve |
|---|---|
| `athena-user` renommé, ancien jeton accepté | `apps/api/src/auth/auth.test.ts` (alias, manager, directeur en lecture seule) |
| Équipes : création, membres, visibilité du manager, charge par personne, refus hors équipe | `apps/api/src/core/team-portfolio.test.ts` (intégration, PostgreSQL) |
| Portefeuilles : synthèse, tri par risque, santé forcée puis calculée, note, rattachement, suppression | idem |
| Catalogue de cartes : directeur = pilotage complet, manager = membre d'équipe | `apps/api/src/core/dashboard.test.ts` |
| Pages Charge des équipes et Portefeuilles par rôle, rôle affiché, confirmation des suppressions | `apps/web/src/steer.test.tsx`, `apps/web/src/guards.test.ts` |
| Suite API complète | 87 fichiers, 714 tests ; un échec isolé de `history.test.ts`, non reproduit en le relançant seul |
| Suite web complète | 4 échecs déjà présents avant le lot (dates ISO tronquées, sélection d'une tâche du planning) |

## Écarts ouverts

- e2e, références visuelles (nouveau rail : deux entrées, icône de rôle) et axe en navigateur à exécuter.
- Cartes de tableau de bord « santé de portefeuille » et « charge d'équipe » : non faites (les pages en tiennent lieu).
- Les comptes Keycloak déjà déployés doivent recevoir le rôle `athena-team-member` (voir `docs/admin/INSTALLATION.md`).
- Aucune démonstration d'équipes ni de portefeuille dans `dev-start` : les comptes doivent s'être connectés une fois pour être membres.
