# ADR-0005 : ergonomie des parcours et cartes organisables (Lot 11)

Statut : accepté (2026-11-11). Plan d'exécution : `docs/dev/tasks/LOT11-PLAN.md`.

## 1. Contexte

Audit d'ergonomie du 2026-11-11 sur les quatre rôles de développement (`user.dev`, `pm.dev`, `qa.dev`, `admin.dev`), 68 écrans dont 3 sur téléphone. Revue en deux tours avec le demandeur, sur une page de relecture (captures avant / après posées dans l'application) : 17 propositions acceptées au premier tour, puis 2 principes et 6 cartes tranchés au second.

## 2. Décisions

### 2.1 Bloquants (premier tour)
1. **Session et limitation de débit** : la lecture de la session (`GET /auth/session`) sort de la catégorie « sensible » (60/min par adresse) et rejoint la limite générale. Le client ne traite jamais une réponse 429 comme une déconnexion : message, nouvel essai automatique selon `Retry-After`, bouton « Réessayer maintenant ».
2. **Onglets** : les onglets d'une page passent sous son en-tête (Rapports) ; sur téléphone ils défilent dans leur rangée, la page garde la largeur de l'écran.
3. **Automatisations** : création depuis Paramètres > Automatisations (administrateur) : formulaire « Quand… si… alors… » sur les déclencheurs et actions de l'API, et des modèles prêts à l'emploi.
4. **Droits manquants** : une entrée inutilisable pour le rôle n'est pas proposée ; une page ou une section non autorisée affiche qui peut agir et comment revenir, jamais une autre page à la place.

### 2.2 Confort (premier tour)
Création de ticket (boutons nommés, champs facultatifs repliés, « Moi »), barre de filtres unique du tracker (et bouton « Filtres » sur téléphone), Mon travail (cartes vides résumées, « Me l'assigner »), fiche (informations clés justes, « M'assigner », « + Ajouter », enregistrement automatique signalé, saisie gardée en cas de conflit), recherche en texte libre (ATQL en « Requête avancée »), Board (dernier board ouvert directement, index en cartes), Backlog (messages exacts, dates en clair, action « Planifier un sprint »), Roadmap (frise datée, repère du jour), Membres (action nommée, réglages d'accès avancés repliés), Administration > Projets (tableau et « Nouveau projet »), Projets (cartes), microcopie (étiquettes de page inutiles retirées, états traduits, états vides avec action).

### 2.3 Cartes (second tour)
1. **Un seul modèle de carte** pour Mon travail, Vue d'ensemble, Avancement et widgets d'extension : en-tête (titre, précision, menu), une visualisation, pied (lien vers le détail). Grille de 12 colonnes, trois largeurs (S = 4, M = 6, L = 8, plus la pleine largeur pour les tableaux), même hauteur pour toutes les cartes d'une grille ; le surplus se lit par « Voir tout ».
2. **Organiser** remplace « Personnaliser » : glisser-déposer par poignée et au clavier, largeur S / M / L, « + Ajouter une carte », disposition enregistrée sur le compte par page (Mon travail, Vue d'ensemble d'un projet, Avancement d'un projet), retour à la disposition par défaut.
3. **Cartes de l'Avancement** (variantes retenues) : indicateurs = trois tuiles égales avec la variation sur 7 jours ; flux = aires empilées (flux cumulé) ; vélocité = barres engagé / réalisé et moyenne, avec un message utile sans sprint clos ; roadmap = la prochaine version (jours restants, tickets à terminer, rythme) ; trackers = une barre par tracker répartie par catégorie de statut ; activité = qui a fait quoi, quand, sans doublon.
4. **Cartes graphiques** (demande du second tour, choix laissé à l'équipe) : sur une recherche (ATQL ou recherche enregistrée), trois formes : **anneau** de répartition par un champ (statut, priorité, responsable, tracker…), **barres** par valeur d'un champ, **indicateur** chiffré (nombre de tickets). Pas de camembert plein ni de 3D : l'anneau porte le total au centre et une légende chiffrée ; au-delà de 7 valeurs, les plus petites se regroupent en « Autres ». Couleurs : palette de données du thème (`data.1` à `data.8`), jamais l'action ni un signal.

## 3. Conséquences
- Migration 057 : `dashboard_layout` porte une disposition par page et, pour chaque carte, sa largeur et ses réglages (recherche, champ, forme).
- API : agrégation d'une recherche par champ (`GET /v1/search/facets`), activité récente dédoublonnée avec auteur et changement.
- Le manuel utilisateur (Word) reste mis à jour en fin de projet (décision du 2026-11-10).
