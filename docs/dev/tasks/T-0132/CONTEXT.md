# Journal de la tâche T-0132

## Fait
- Athena : échelle par rôles `font.size` (small 12, body 14, subsection 14, section 16, title 22, display 28), interlignes par rôle, interlettrage réduit à `title` (0,01 em) et `mono` (0,02 em) ; rôles `type.*` de la charte 3 retirés (contrat : 121 jetons).
- Feuille : casse de phrase partout (plus aucun `text-transform: uppercase` ni interlettrage de label) ; libellés en semi-gras 12 px ; corps, tableaux, champs, onglets, boutons et rail à 14 px ; titre de page 22 px ; valeur de statistique 28 px.
- Titres : un traitement par niveau, `.ath-section-title` (h2), `.ath-subsection-title` (h3), `.ath-group-title` (h4) ; 53 titres convertis dans l'application et les composants partagés ; seul le titre de navigation du rail garde sa classe.
- Prose (commentaires, documents, `.ath-prose`, `.ath-md`) limitée à 72 caractères.
- Polices : Plex Sans 500 et Plex Mono 600 chargées.
- Dates : `lib/dates.ts` (`Intl.DateTimeFormat`, langue de l'interface, fuseau du navigateur) sur les 11 affichages qui tronquaient l'ISO ; tests unitaires en UTC (`test-setup.ts`).
- Tests : `typographie.test.ts` (capitales, niveaux de titre, dates) ; comparaison à la référence d'avant le lot sans les `--ath-type-*`.
- Vérifications : `@athena/ui` 41/41 et lint ; web 426/426 ; e2e 44/44 (suite complète, GitLab démarré) ; captures revues (fiche, écran Tracker) puis reprises comme référence (`pnpm visuel` 96/96 stable).

## Reste à faire
- Rien. Suivante : T-0133.

## Décisions et pièges
- Les espacements hors échelle (5, 6, 9, 10, 14, 18 px) sont repris en T-0133 (contrôles) et T-0135 (densité).
- Le pied du rail (avatar et 6 boutons-icônes) reste rogné en 232 px : T-0134.

## Prompt de reprise
Lot 10, ADR-0004. T-0126 à T-0132 faites. Reprendre par T-0133 : composants `Select`, `Textarea`, `Checkbox`, `Radio`, `Switch` dans `@athena/ui` ; hauteur unique 32 px ; états survol, focus, erreur, désactivé, lecture seule (cadenas et info-bulle ; la fiche passe un champ en lecture seule quand `writeRoles` exclut l'utilisateur) ; migration des `select` et cases à cocher nus.
