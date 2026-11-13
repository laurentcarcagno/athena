# ADR-0007 : tableau de bord modulaire et personnalisable (Lot 13)

Statut : accepté (2026-11-13), points du § 4 confirmés par le demandeur. Plan d'exécution : `docs/dev/tasks/LOT13-PLAN.md`. Maquette validée en cours de revue : `docs/dev/maquettes/lot13-tableau-de-bord.html` (galerie des widgets dans chaque état du projet, deux thèmes). Référence visuelle des indicateurs de pilotage : `docs/dev/maquettes/lot13-reference-kpi-planava.png`.

## 1. Contexte

Le tableau de bord actuel (ADR-0003 § 2.1, ADR-0005 § 2.3) range des cartes à la suite, sur une grille de 12 colonnes, avec trois largeurs (S, M, L, XL), un ordre, et la présence. Il manque : un placement libre en deux dimensions, un catalogue filtré par rôle, plusieurs exemplaires d'un même widget (un par projet), des widgets de pilotage (santé, avancement, indicateurs, qualité, pipelines), et des cartes qui se ressemblent entre elles.

## 2. Décisions

### 2.1 Grille et édition
1. **Grille en deux dimensions** : 12 colonnes, lignes de 88 px, chaque widget porte `x`, `y`, `w`, `h`. Les tailles prédéfinies (Compacte, Standard, Étendue) donnent `w` et `h` par genre ; il n'y a pas de redimensionnement libre.
2. **Deux états** : *vue* et *édition*. En édition : grille en pointillés (cellules bordées, sans dégradé), tiroir « Catalogue » à droite, poignée de déplacement, engrenage (configuration), retrait.
3. **Glisser-déposer** par pointeur (widget et carte du catalogue) avec aperçu de l'emplacement réel (anti-chevauchement : le widget descend à la première place libre). **Équivalents clavier** obligatoires : flèches sur la poignée, bouton « Ajouter » du catalogue ; chaque déplacement est annoncé (région `aria-live`). Annuler / Enregistrer / Rétablir.
4. **Mobile** : sous 720 px, une colonne, dans l'ordre de lecture (y puis x) ; l'édition se fait par le catalogue.
5. **Compatibilité** : les dispositions existantes (ordre + S/M/L/XL = 4/6/8/12 colonnes) sont converties à la lecture (migration de données) en positions `x`, `y` ; aucune disposition n'est perdue.

### 2.2 Catalogue, rôles, exemplaires
1. Le catalogue est **filtré côté serveur** selon les rôles (`athena-user` = développeur, `athena-pm` = chef de projet, `athena-qa` = assurance produit, `athena-admin` = administrateur ; l'administrateur voit tout). Le client n'est qu'un affichage : un `PUT` contenant un widget interdit au rôle est refusé (403).
2. **Plusieurs exemplaires** d'un même genre sont permis. Chaque exemplaire porte son projet, son titre et ses réglages (période : 7, 14 ou 30 jours). Le nombre total reste plafonné (24).
3. La disposition par défaut dépend du rôle (reprend `homeWidgetsFor`, complétée par les nouveaux genres).

### 2.3 Widgets
Douze genres au catalogue, tous avec un **état vide** (illustration grise minimaliste, phrase d'explication, bouton d'action nommé) :
- **Reprise des cartes existantes** avec une ligne commune (identifiant en IBM Plex Mono, titre tronqué, pastille d'état à droite) : Mes tickets, En retard, Chemin critique, Risques, À valider, Favoris, Récents.
- **Pilotage** (d'après la référence KPI) : Informations générales (statut, date de situation, période, durée, tâches / actives / membres), Avancement global (jauge en arc, répartition par statut), Indicateurs clés (retards, échéances proches, charge par membre, vélocité, tâches bloquées), Santé du projet (grand chiffre « tickets bloquants », retards, risques critiques), Progression du sprint (anneau).
- **Pipelines CI/CD** : douze dernières exécutions par dépôt, jauge fine, exécution en cours animée (animation coupée par `prefers-reduced-motion`).
- **Qualité du code** et **Badges du projet** (SonarQube) : voir 2.5.

### 2.4 Apparence et thèmes
1. Deux nouveaux thèmes dans `@nuance/themes` (ADR-0004), chacun avec les modes exigés par le contrat : **« Hemeria arrondi »** (palette Hemeria, rayon 8 px, bordure 1 px, aucune ombre) et **« GitHub »** (thème inspiré de GitHub Primer, avec ses deux modes : clair et sombre, dérivé d'une `palette.json`). Hemeria conserve ses angles droits ; seul le jeton de rayon diffère.
2. **Jetons sémantiques ajoutés** : couleur « fusionné » (violet, absente d'Hemeria : valeur proposée `#6E4BB8` clair, `#A98BEA` sombre) et jeu « brouillon » (gris). Statuts : succès, fusionné, bloquant, brouillon, avertissement, information. Chaque paire texte/fond est ajoutée au contrat (WCAG 2.2 AA).
3. Un widget ne lit que des jetons sémantiques ou de composant. **L'état n'est jamais porté par la couleur seule** (texte, lettre, pastille nommée). Aucun dégradé, aucun verre dépoli.

### 2.5 Données
1. **Pilotage** : un seul point d'agrégation `GET /v1/projects/:p/kpis` (comptages par catégorie, retards, échéances sous 7 jours, charge par membre, vélocité, tâches bloquées) ; le sprint réutilise l'agile existant. Pas de nouvelle table.
2. **Pipelines** : lecture des pipelines GitLab du projet par le service d'historique existant, mise en cache courte.
3. **SonarQube** : la connexion réelle (jeton dans OpenBao, synchronisation de la quality gate, des notes A à E, de la couverture, des doublons et de la dette) est **hors lot 13**. Le lot livre le contrat d'API (`GET /v1/projects/:p/quality`, réponse « non relié » tant qu'il n'y a pas de fournisseur), les deux widgets et leur état vide « Relier SonarQube ». Les badges (pipeline, quality gate, couverture, bugs, vulnérabilités, version, sprint) s'alimentent de GitLab et des versions dès maintenant ; ceux de SonarQube restent masqués sans connexion.

## 3. Conséquences
- Migration 062 : positions des widgets dans `dashboard_layout` (conversion des dispositions existantes), exemplaires multiples, réglages par widget.
- API : catalogue par rôle, validation (bornes, chevauchement, rôle), `kpis`, `pipelines`, `quality`.
- Le composant `Dashboard` est refondu ; la grille actuelle (`DashGrid`, trois largeurs, réorganisation par ordre) disparaît au profit de la grille 2D.
- Le manuel utilisateur (Word) reste mis à jour en fin de projet (décision du 2026-11-10).

## 4. Points confirmés par le demandeur (2026-11-13)
1. Violet « fusionné » adopté pour l'état « en revue » (valeur proposée ci-dessus).
2. Connexion SonarQube reportée au lot 14 ; le lot 13 livre widgets et état vide.
3. « GitHub » est un nouveau thème complet d'Athena (clair et sombre, disponible partout), pas seulement du tableau de bord.
4. Indicateurs de pilotage : vélocité et tâches bloquées sont ajoutées à ceux de la référence ; les indicateurs financiers (budget consommé, reste à faire) sont refusés et restent hors lot.
