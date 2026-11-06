# Journal de la tâche T-0072

## Fait
- Migration **038** (la fiche disait 037, prise par T-0069) : table `tailoring` (clause = référence, catégorie ou `*`, applicabilité, justification ; contrainte de base : justification non vide si non applicable ou modifiée ; RLS forcée, `org_isolation`, droits `athena_app`).
- `normativeClauseTracker` (`templates.ts`) : tracker NORM « Exigences normatives » (titre, référence, norme, texte ; états en vigueur / retirée).
- `import/clause-csv.ts` : lecture des clauses (BOM, `,` `;` tabulation, guillemets, en-têtes FR/EN), erreurs ligne par ligne (doublon, référence ou titre manquant) ; `parseCsv` accepte désormais la tabulation.
- `NormativeService` : `importClauses` (idempotent : créée / mise à jour / inchangée / erreur, rapport par ligne), tailoring (liste, pose, effacement), `conformity` (taux = clauses applicables ou modifiées liées à au moins une preuve ; catégorie du projet par défaut ; tailoring de catégorie prioritaire sur `*`), `conformityCsv` (BOM, cellules protégées contre les formules).
- Routes `/v1/projects/:p/{clauses/import, tailoring, conformity, conformity/export}` ; écriture pour `athena-admin` et `athena-pm`, lecture pour tous.
- Onglet « Conformité » (module `conformity`, actif quand le projet a un tracker NORM), `ConformityTab.tsx` : taux, catégorie, tableau clause × preuves, formulaire de tailoring avec justification obligatoire, import de fichier avec rapport, export CSV. Textes FR/EN.
- Tests : `clause-csv.test.ts` (5), `normative.test.ts` (6), `web17.test.tsx` (5, dont axe) ; tests d'ordre des onglets mis à jour (neuf onglets).

## Décisions
- Preuve = tout item d'un autre tracker lié à la clause, dans l'un ou l'autre sens, quel que soit le type de lien. Les documents StrictDoc comme preuve arrivent avec le Lot 5.
- « Modifiée » exige aussi une justification (la fiche ne l'imposait que pour « non applicable » ; plus strict, cohérent avec la spécification).
- Clause en vigueur = item NORM dont l'état n'est pas de catégorie « terminé ».

## Écarts
- Aucun.
