# T-0074 : Gabarit Défense (AQAP)

- **Lot** : 3 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Livrer en données le gabarit Défense : AQAP-2110 + AQAP-2210 éd. B, trackers dont faits techniques, dérogations et concessions.
- **Fichiers concernés** :
  - `apps/api/src/core/templates/defense.ts`
  - `apps/api/src/core/templates.ts`
- **Migration** : aucune
- **Critères d'acceptation** (testables) :
  - Trackers : exigences client (STB), exigences logicielles, interfaces, conception, cas de test et PV, faits techniques, demandes de modification, dérogations et concessions, remarques de revue
  - Criticité paramétrable par programme ; revues paramétrables
  - Règle : tout fait technique rattaché à un article de configuration
  - Champs de marquage présents (mention, contrôle export) mais sans effet avant le Lot 4
- **Tests à écrire** :
  - Vitest : schéma
  - API : création de projet
  - Héritage : dérivé « Défense — DR et ITAR »
- **Règles communes** : interface Hemeria (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : T-0070, T-0071
