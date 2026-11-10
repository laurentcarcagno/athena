# T-0127 : moteur de thèmes `@nuance/theming`

- **Objectif** : moteur générique, sans dépendance à Athena : jetons W3C Design Tokens, alias, modes, héritage, contrôle des contrastes, génération CSS, ligne de commande.
- **Critères d'acceptation** (testables) :
  - alias circulaire refusé (message qui nomme la boucle) ; alias, parent inconnus et héritage circulaire refusés ;
  - paire de contraste sous le seuil = constat, par thème et par mode ; jeton obligatoire absent = constat ;
  - sortie CSS déterministe ; mode par défaut complet, autres modes en différence, préférence système respectée sauf mode imposé ;
  - `theming check` rend 0 / 1 ; `theming build` n'écrit rien pour un thème non conforme ;
  - aucun fichier source n'importe `@athena/*` ni React (test).
- **Fichiers concernés** : `packages/theming/` (`package.json`, `tsconfig.json`, `README.md`, `src/tokens.ts`, `color.ts`, `check.ts`, `css.ts`, `cli.ts`, `bin.ts`, `index.ts`, `theming.test.ts`).
- **Hors périmètre** : runtime navigateur et liaisons React (T-0128), thèmes et contrat d'Athena (T-0129).
- **Dépendances** : ADR-0004 § 2.9 et § 3.
