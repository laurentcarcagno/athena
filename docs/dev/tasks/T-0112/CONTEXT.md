# Journal de la tâche T-0112

## Fait (2026-11-10)
- `c1df2c2` : découpage sans changement de comportement. `components/ItemHeader.tsx` porte l'en-tête du panneau et celui de la page, les transitions (`availableTransitions`), l'abonnement et l'épingle.
- API (`10e00a9`) :
  - migration 047 : rôles sémantiques `priority` et `version`. Les gabarits Bugs (`severity`, `fixed_version`) et Exigences (`priority`) les portent ; les gabarits normatifs Spatial et Défense ne sont pas touchés (versions publiées) ;
  - `GET /v1/projects/:p/artifacts/:clé/sprint` rend `{ sprint: { id, name, state } | null }` (sprint non clos) ;
  - `LinkView.hierarchical`.
- Web :
  - `ItemFacts` (dans `ItemHeader.tsx`) : responsable, priorité, échéance, version, sprint, parent, bloqué par. La liste `dl` est nommée « Informations clés », en version compacte dans le panneau ;
  - classe `.ath-facts` dans `packages/ui/src/styles.css` (tokens existants) ;
  - `?onglet=` dans `ArtifactView` (`TABS`). Le panneau de l'écran Tracker garde `onglet` en J/K, le retire à la fermeture, et « Agrandir » le transmet à la page ;
  - une ancienne clé redirige en gardant les paramètres ;
  - changer de ticket vide les liens et le sprint affichés.
- Tests :
  - `item-sheet.test.tsx` (8) ;
  - `web10` (+1 : panneau, J, Échap) ;
  - API : `agile.test` (+1), `links.test` ;
  - e2e `fiche.spec.ts` (1).
- Vérifications : Vitest web 369 sur 369, `tsc` web et API OK, `lint-design` et `validate-design` OK, e2e 37 sur 37 (dont l'audit axe avec contraste, thèmes clair et sombre).

## Reste à faire
Rien.

## Décisions et pièges
- Information absente : « — » avec le texte masqué « non renseigné » (lecteurs d'écran). La grille ne change pas d'un ticket à l'autre.
- Pour priorité et version, le libellé du champ remplace le libellé générique (« Sévérité », « Version corrigée »).
- Parent : lien sortant d'un type hiérarchique. Bloqué par : liens entrants du type `blocks`. Le regroupement complet des relations relève de T-0113.
- Le responsable s'affiche en identifiant brut : le nom lisible est prévu avec T-0114 (carte du board).
- `history.test.ts` : 2 échecs (chiffrement confidentiel, contrôle export) quand GitLab est disponible. Ils sont reproduits sur `46a1247` sans les changements de T-0112, donc préexistants (environnement OpenBao ou GitLab). Quand GitLab ne répond pas, ces tests sont ignorés.
- axe `heading-order` (bonne pratique, hors WCAG) : `Card` rend un `h3` sous le `h1` de la page, et ce n'est pas nouveau. Les tests suivent la convention du dépôt (étiquettes WCAG).
- Sous PowerShell, `git commit -F -` avec une here-string échoue : écrire le message dans un fichier, puis `-F fichier`.

## Commandes utiles
`cd apps/web && npx vitest run src/item-sheet.test.tsx src/web10.test.tsx` ; `cd e2e && node global-setup.mjs && npx playwright test tests/fiche.spec.ts`

## Prompt de reprise
Lire `docs/dev/STATE.md`, `docs/dev/tasks/LOT9-PLAN.md`, puis T-0113 (relations groupées, retour à la liste d'origine, précédent et suivant).
