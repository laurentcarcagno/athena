# Journal de la tâche T-0134

## Fait
- `TabLinks` (onglets qui changent d'adresse, rendu des onglets, `aria-current="page"`) : vues du tracker, Rapports et Paramètres (les filtres ne servent plus de navigation). Les onglets d'état (`Tabs`) restent pour la fiche et l'Organisation.
- `IconButton` et une seule classe `.ath-iconbtn` (surface claire par défaut, `--inverse` pour le rail, tailles `--sm` et `--bare`) ; fermeture de modale et de notification, effacement de filtre, rail, thème migrés ; `.ath-icon-btn` et les surcharges `.ath-td .ath-iconbtn` supprimées.
- Pastille (fond teinté, point), tag (contour seul), filtre (hauteur de contrôle, libellé secondaire sans opacité : 4,5:1 tenu).
- Sélection commune : fond « sélection » et repère d'accent de 2 px (tableau, liste, arbre, palette).
- Tableau : en-tête sur `surface.muted`, texte de titre, flèche de tri secondaire et `border.focus` quand active (paires ajoutées au contrat : 36 au total).
- `PageContextProvider` : le projet courant (« Projet ARI · Ariane ») au-dessus du titre de chaque page de projet ; titres et eyebrows ne répètent plus la clé (13 pages). L'étoile « épingler le projet », masquée jusqu'ici par l'en-tête collant (défaut antérieur), rejoint les actions de l'en-tête.
- `Card` : variante `section` (filet seul) ; en-tête de carte qui passe à la ligne (titre et méta ne se chevauchent plus).
- Pied du rail sur deux lignes : plus de bouton rogné à 232 px.
- Dates seules (flux, burndown, échéances du Board) localisées comme jour du calendrier et dans des `<time>`.
- Vérifications : `@athena/ui` 49/49 ; web 433/433 ; thèmes conformes ; référence visuelle reprise et stable ; suite e2e complète (voir STATE).

## Reste à faire
- Rien. Suivante : T-0135 (densité).

## Prompt de reprise
Lot 10, ADR-0004. T-0126 à T-0134 faites. Reprendre par T-0135 : densité Normal / Compact (`data-density`), `pointer: coarse`, préférence sur le compte (migration 053), réglage dans Profil ; reprendre les espacements hors échelle (5, 6, 9, 10, 14, 18 px).
