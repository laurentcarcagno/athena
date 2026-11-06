# T-0077 : Test d'absence de requête sortante

- **Lot** : 4 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Ajouter un test qui échoue si l'application tente une requête sortante.
- **Fichiers concernés** :
  - `apps/api/src/testing/no-egress.ts`
  - `apps/api/src/testing/no-egress.test.ts`
  - `e2e/tests/no-egress.spec.ts`
- **Migration** : aucune
- **Critères d'acceptation** (testables) :
  - API : garde sur `http/https/net/dns` en test, liste d'autorisation limitée aux hôtes internes configurés
  - e2e : le navigateur échoue le test si une requête sort de l'origine (routage Playwright)
  - Le test est rouge sur un appel fictif vers un hôte public (preuve dans le test)
- **Tests à écrire** :
  - Test unitaire du garde
  - e2e Playwright sur les pages principales
- **Règles communes** : interface Hemeria (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0076
