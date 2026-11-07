# Journal de la tâche T-0096

## Fait
- Audit rejoué contre le code : F-08 à F-13 vérifiés, F-01 à F-07 confirmés par leurs tests. État de chaque constat avec preuve rejouable dans `design-audit-work/AUDIT_athena.md` § 6.
- **F-13** : déjà corrigé dans le code (`AdminPage.tsx`), sans test ; test ajouté (`audit-followup.test.tsx` : message, aucun onglet, aucun appel réseau, administrateur inchangé).
- **F-08** : les boutons cités avaient déjà `Btn loading` ; `api()` fusionne désormais les écritures identiques en cours (méthode, adresse, corps) : un double clic ne produit qu'une requête, sur tous les formulaires. Comblé ensuite : `Btn` passe en « loading » dès qu'un clic déclenche une écriture (`writeActivity`), sur tous les formulaires.
- **F-14 (nouveau)** : l'axe rejoué avec contraste a trouvé `.ath-diff__to` (vert de signal sur blanc, 4,2:1) dans l'onglet Historique. Les textes d'état (diff, delta, erreur de champ, toasts) emploient `{semantic.state.*.fg}` ; `tokens.test.ts` interdit la couleur de signal brute en texte.
- Tests de garde ajoutés : tailles de texte (≥ 11 px) et cibles de 24 px (`tokens.test.ts`).
- **F-11** : décision consignée (§ 6.2) : indication permanente toujours retirée (décision du 2026-11-01), écart à `DESIGN.md` assumé.
- Mesure axe sur toutes les pages : `e2e/tests/audit.spec.ts`, 23 adresses et 5 onglets de fiche, administrateur (clair et sombre) et utilisateur, contraste compris : 0 violation.
- `docs/dev/tasks/LOT7-VERIFICATION.md` : critère par critère des six tâches.

## Décisions
- F-11 n'est pas « corrigé » : c'est un écart accepté par décision produit, à confirmer par l'utilisateur au compte rendu.
- Le dédoublonnage des écritures est dans le client (`api.ts`), pas dans chaque composant : un seul endroit, aucune dérive possible.

## Écarts
- F-11 (assumé, à confirmer) : voir `LOT7-VERIFICATION.md`.
