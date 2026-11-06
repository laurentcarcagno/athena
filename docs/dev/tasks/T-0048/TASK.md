# T-0048 : Hygiène du dépôt et spécification

- **Lot** : 0 (reprise IHM, voir `docs/dev/DECISIONS/ADR-0002-ihm-cible.md`)
- **Objectif** : Retirer le cache `.turbo/` du suivi Git et ranger la spécification IHM dans le dépôt.
- **Fichiers concernés** :
  - `.gitignore`  (vérification)
  - `docs/dev/SPEC_IHM.md`  (déjà déplacé par le commit du plan)
- **Migration** : aucune
- **Critères d'acceptation** (testables) :
  - `git ls-files .turbo` ne renvoie rien ; `.turbo/` reste dans `.gitignore`
  - `pnpm check` passe sans régénérer de fichier suivi
  - Le commit ne contient que des suppressions d'index
- **Tests à écrire** :
  - Aucun test nouveau ; `pnpm check` complet
- **Règles communes** : interface Hemeria (lint design vert), aucun texte en dur (FR/EN), identifiants en IBM Plex Mono, aucun appel réseau externe, `pnpm check` vert avant commit, un commit par changement logique.
- **Hors périmètre** : tout ce qui relève d'une autre tâche de la liste « Reprise IHM » de `docs/dev/STATE.md`.
- **Dépendances** : aucune
