# T-0149 : rechercher avec des mots

- **Objectif** : la recherche accepte des mots et des clés ; l'ATQL reste disponible en requête avancée (revue d'ergonomie, O5 ; ADR-0005 § 2.2).
- **Critères d'acceptation** : mots → `text ~ "…"` sans toucher aux autres clauses ; clé → ouverture de la fiche ; « Requête avancée (ATQL) » ; titre « Recherche » ; tests web de traduction ; e2e recherche verte.
- **Fichiers** : `apps/web/src/pages/GlobalSearchPage.tsx`, `i18n.ts`, `global-search-page.test.tsx` ; `e2e/tests/ergonomie.spec.ts`.
