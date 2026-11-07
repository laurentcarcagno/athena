# Journal de la tâche T-0082

## Fait
- `DocumentsTab.tsx`, `DocTree.tsx`, `DocNodeView.tsx` : liste des documents, plan (sections et exigences, ancres `#UID`), contenu dans l'ordre de lecture, recherche par UID (exact, préfixe) ou texte, panneau de citations (nombre dans la liste, détail dans le panneau, utilisé aussi par T-0083).
- Onglet **masqué sans source documentaire indexée** (module `documents` de `/modules`) ; routes `/p/:p/documents` et `/p/:p/documents/:doc`, **adresse stable par exigence** `/p/:p/documents/:doc#UID` (le nœud est sélectionné, `aria-current="location"`, et la page défile jusqu'à lui).
- UID en `ath-mono` ; bannière « Lecture seule : modifier dans StrictDoc. » avec lien vers la source (`rel="noopener noreferrer"`) et SHA indexé ; textes affichés comme du texte (les balises sont retirées côté API, et React n'interprète rien) ; aucun attribut `style` ; titres de niveau cohérent avec la profondeur.
- Textes FR/EN `docs` ; styles `.ath-doc*` (indentation par classes, aucun arrondi ni ombre).
- Tests : `web23.test.tsx` (7 dont axe, citations ouvertes), e2e `documents.spec.ts` (ouvrir un document, chercher une UID, adresse stable) avec `e2e/support/docs.ts` pour les aides communes. e2e : 24 sur 24.

## Écarts
- Aucun.
