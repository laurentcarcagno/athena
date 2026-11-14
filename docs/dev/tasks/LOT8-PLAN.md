# Lot 8 : retours de relecture du manuel utilisateur (2026-11-09)

Source : 17 commentaires Word de Laurent Carcagno sur `user-manual-work/Manuel utilisateur - Athena.docx`
(édition A). Objectif : corriger ou refactorer les écrans commentés, puis mettre à jour la documentation
(`docs/user`) et répondre aux commentaires du manuel.

## Correspondance commentaires → tâches

| # | Commentaire (résumé) | Tâche |
|---|---|---|
| 14 | Page de connexion : personnaliser avec le design ATHENA | T-0108 |
| 16 | Le nom du produit est ATHENA (plus « ATHENA·BOARD / Suivi de projet ») | T-0103 |
| 20 | Rail : supprimer le nom d'utilisateur, garder les initiales | T-0103 |
| 19 | Rail : remplacer le texte du rôle par une icône | T-0103 |
| 31 | Rail replié : ne plus rien afficher de gênant, permettre seulement de le réafficher | T-0103 |
| 22 | « Récents » : un menu qui se déploie sur le côté au lieu d'une longue liste | T-0104 |
| 21, 33 | « Favoris » sous Récents (menu déployable) ; étoile pour créer un raccourci selon le focus courant | T-0104 |
| 53 | Retirer du rail les entrées du projet (vue d'ensemble… membres) : redondantes avec les onglets | T-0104 |
| 39 | PROJETS : tableau des projets accessibles, icône de dépliage des trackers, clic sur le nom ouvre le tracker, le projet choisi devient le projet courant | T-0105 |
| 40 | PROJETS : raccourci de création de projet | T-0105 |
| 37 | Ne pas afficher le tag (clé) à côté du nom du tracker | T-0105 |
| 43 | Mon travail : « Assignés à moi » vide à tort (filtre) | T-0106 |
| 26 | Recherche : grouper les résultats par tracker | T-0106 |
| 51 | Colonnes du board : séparateur entre état et compteur | T-0106 |
| 29 | Boutons à icônes avec info-bulle, partout où cela a du sens | T-0107 |
| 46 | Intégrer le guide utilisateur à l'application (Aide) | T-0107 |

## Tâches (une par session, ordre ci-dessous)

1. **T-0103 Coquille : marque, utilisateur, rail replié.** Marque « ATHENA », pied du rail = avatar à initiales + icône de rôle (info-bulle), rail replié réduit à un bouton de réaffichage.
2. **T-0104 Rail : Favoris et Récents en menus latéraux, retrait des entrées de projet.** Étoile contextuelle déjà présente (PinToggle) : vérifier qu'elle suit le focus (projet, tracker, vue, item).
3. **T-0105 Page Projets.** Tableau des projets, dépliage des trackers, projet courant, bouton « Nouveau projet », suppression du tag de clé.
4. **T-0106 Mon travail, recherche, board.** Correction du filtre « Assignés à moi » (identifiant du compte, pas son nom), regroupement par tracker, séparateur de compteur.
5. **T-0107 Boutons à icônes et aide intégrée.** Icônes + info-bulles (`title` et `aria-label`), page Aide qui affiche le guide utilisateur.
6. **T-0108 Page de connexion Keycloak (thème ATHENA).** Thème Keycloak du dépôt `deploy/dev`.

Chaque tâche : tests ciblés (vitest), pas de régression des e2e existants, un commit conventionnel.

## Hors périmètre / réserves
- T-0108 dépend du thème Keycloak : si l'image ne le charge pas dans l'environnement de développement, l'écart est signalé à l'utilisateur au lieu d'être contourné.
- Fin de lot : arrêt et compte rendu (règle du changement de lot).

## Après le développement
- Mettre à jour `docs/user` (captures de texte, libellés), `docs/dev/STATE.md`.
- Régénérer le manuel (`/doc:mu`) ou appliquer les réponses avec `/doc:mu --comments`.
- Répondre aux 17 commentaires, signés Laurent Carcagno, édition A inchangée.
