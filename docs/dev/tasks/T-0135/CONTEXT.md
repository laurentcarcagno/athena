# Journal de la tâche T-0135

## Fait
- API : migration 053 (`user_preference.density`, `normal` | `compact`, nulle = réglage du navigateur) ; `PreferenceService` et validation ; tests (4/4).
- Web : le contrôleur pose `data-density` (défaut `normal`) ; mémoire locale `athena.density` (effacée en Normale) à côté de `athena.theme` ; `getDensity`, `setDensity`, `useDensity` ; préférence du compte appliquée au chargement (sans écraser un réglage changé entre-temps) ; sélecteur « Densité » dans Profil, enregistré sur le compte.
- Styles : `styles/density.css` (importée en dernier) : `--ath-row-y` (8 px, 4 px en Compacte) ; Compacte = contrôles 28 px, bouton-icône 24 px, corps et sous-section 13 px, section 15, titre 20, display 24 ; `pointer: coarse` = contrôles, boutons-icônes et cible minimale à 44 px, cases de 24 px.
- Espacements hors échelle supprimés : 5 et 6 → 4 px, 10 → 8, 14 → 12, 18 → 16 ; padding vertical des cellules par `--ath-row-y`.
- Tests : `density.test.ts` (Compacte plus serrée, planchers 12 px et 24 px, 44 px tactile) ; tests web (attribut, mémoire, compte, Profil) ; e2e `controles.spec.ts` (Compacte mesurée à 28 px, retrouvée au rechargement).
- Vérifications : `@athena/ui` 52/52 ; web 435/435 ; API préférences 4/4 ; e2e ciblés verts ; référence visuelle reprise ; suite complète (voir STATE).

## Reste à faire
- Rien. Suivante : T-0136 (thèmes vague 1, sélecteur, apparence de l'organisation, palier 1024 px).

## Décisions et pièges
- Pas de niveau « confortable » (ADR-0004) : le tactile est traité par `pointer: coarse`.
- La règle tactile cible `:root[data-density]` : `:root` seul perdrait face au bloc du thème (`:root[data-theme]`).
