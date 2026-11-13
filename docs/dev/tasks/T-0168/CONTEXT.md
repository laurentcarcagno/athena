# Journal de la tâche T-0168

## Fait
Rien de codé. Plan, ADR-0007 et maquette commités (2e4adcd, 521b088). Configuration Git globale corrigée (`laurent.carcagno@gmail.com`).

## Reste à faire
Toute la tâche (voir TASK.md). Pistes :
1. Lire `packages/themes/README.md`, `contract.json` (jetons obligatoires, paires) et un thème dérivé (`dracula/palette.json` + `tools/derive.mjs`) pour reproduire le format.
2. Étendre le contrat : jetons de statut « merged » et « draft » (et leurs variantes texte / fond), paires de contraste ; vérifier que les thèmes existants restent conformes (leur donner des valeurs).
3. « GitHub » : dériver depuis une `palette.json` (valeurs de la maquette : sombre `#0D1117`, `#161B22`, `#30363D`, texte `#E6EDF3`, action `#2F81F6`, succès `#3FB950`, fusionné `#A371F7`, danger `#F85149` ; clair Primer : fond `#FFFFFF`, bordure `#D0D7DE`, texte `#1F2328`, action `#0969DA`, succès `#1A7F37`, fusionné `#8250DF`, danger `#CF222E`, avertissement `#9A6700`). Vérifier les contrastes AA par mode, corriger les teintes de texte au besoin.
4. « Hemeria arrondi » : primitives Hemeria (`packages/ui/design/DESIGN.json`), rayon 8 px, mode sombre à dériver (non spécifié : proposer et vérifier AA).
5. Brancher dans `build-themes.mjs` et le sélecteur de thème ; ajouter les tests.

## Décisions et pièges
- Les couleurs de la maquette sont des valeurs de départ, pas une validation AA : les contrastes se vérifient avec `pnpm test` du paquet.
- Hemeria : pas de dégradé, pas d'ombre, identifiants en IBM Plex Mono.
- Commits : auteur `laurent.carcagno@gmail.com`, aucun Co-Authored-By, jamais `--no-verify`.

## Commandes utiles
`pnpm --filter @nuance/themes test` ; `node packages/themes/tools/derive.mjs <thème>/palette.json` ; `pnpm visuel:reference` (après relecture).

## Prompt de reprise
« Reprends Athena : lis docs/dev/STATE.md puis docs/dev/tasks/T-0168/CONTEXT.md, fais git status et git log -5, lance les tests de packages/themes, annonce un plan court, puis réalise T-0168 (lot 13). »
