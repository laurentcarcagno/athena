# Journal de la tâche T-0155

## Fait
- Cartes (`ProgressCards.tsx`) : **Tickets** (trois tuiles égales, variation sur 7 jours, total) ; **Prochaine version** (nom, période, jours restants, tickets à terminer, barre d'avancement, « n % terminé · m % du temps écoulé : dans le rythme / en retard sur le rythme ») ; **Flux cumulé** (aires empilées par catégorie, légende, tableau des données dépliable) ; **Trackers par statut** (une barre par tracker répartie à faire / en cours / terminé) ; **Vélocité** (engagé et réalisé par sprint, moyenne en pointillé ; sans sprint clos : message et « Ouvrir le backlog ») ; **Activité récente** (« Alice a modifié Responsable de ARI-BUG-0001 · il y a 2 h », une ligne par ticket). SVG à positions en pourcentage, aucun style en ligne ; couleurs des catégories de statut et palette de données.
- Avancement (`/rapports/avancement`) : en-tête, onglets, puis le tableau de bord organisable de la page (portée `CLÉ:avancement`) ; widgets d'extension au modèle de carte commun.
- Vue d'ensemble : l'ancien bloc d'avancement intégré disparaît (doublon du rapport) ; la carte Tickets s'y ajoute par défaut (pleine largeur) et toutes les cartes d'avancement y sont proposées par « + Ajouter une carte ».
- API : six genres de carte d'avancement (avec la clé du projet) ; disposition par défaut de l'Avancement ; l'activité récente du tableau de bord du projet ne renvoie plus qu'une ligne par ticket (sa dernière révision).
- Tests : API 9/9 (défaut de l'Avancement, activité sans doublon) ; web 474/474 (cartes, rythme, vélocité vide, une ligne par ticket, aucun style en ligne, axe) ; e2e `themes` (l'Avancement ajouté aux six écrans : 126 audits sans violation), `ergonomie`, `tableau-de-bord` verts.

## Décisions et pièges
- Le lien « Voir le tableau des données » du flux (maquette) mènerait à une page qui n'existe plus : le tableau est dans la carte, dépliable (et sert d'alternative textuelle au graphique).
