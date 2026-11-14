# Lot 13 : tableau de bord modulaire et personnalisable (2026-11-13)

Décisions : `docs/dev/DECISIONS/ADR-0007-tableau-de-bord-modulaire.md`. Maquette : `docs/dev/maquettes/lot13-tableau-de-bord.html` (ouvrir dans un navigateur ; sélecteurs de rôle, d'état du projet et de thème ; vue « Galerie des widgets »).
Règle : une tâche par session, dans l'ordre ci-dessous ; arrêt et compte rendu en fin de lot ; aucun écart toléré sans accord explicite ; le lot ne s'ouvre que sur demande de l'utilisateur (règle de changement de lot). Les références visuelles (`pnpm visuel:reference`) sont reprises à chaque tâche qui change un écran capturé, après relecture des différences. Numéros de migration indicatifs (prochaine réelle : 062).

## Tâches

| Tâche | Réf. ADR | Objet | Critères d'acceptation |
| --- | --- | --- | --- |
| T-0167 | — | ADR-0007, plan du lot 13, maquette et référence rangées, `STATE.md` | Documents relus par le demandeur ; points de l'ADR § 4 confirmés le 2026-11-13 |
| T-0168 | § 2.4 | Thèmes « Athena arrondi » et « GitHub » (modes clair et sombre, dérivé de `palette.json`) dans `@nuance/themes` : jetons « fusionné » et « brouillon », jeu de statuts, paires de contraste au contrat ; sélection dans les préférences | `pnpm test` des thèmes : chaque thème, chaque mode, toutes les paires AA ; test web du sélecteur ; aucun dégradé ni ombre (contrôle existant) |
| T-0169 | § 2.1, § 2.2 | Modèle de disposition 2D : migration 062 (`x`, `y`, `w`, `h`, `project`, `period` par widget, exemplaires multiples) ; conversion des dispositions existantes ; schéma Zod ; refus des chevauchements, des bornes et des doublons d'identifiant | Tests API : conversion S/M/L/XL → colonnes sans perte ; chevauchement ou hors grille → 422 ; plafond de 24 ; ancien client lisant une disposition convertie |
| T-0170 | § 2.2 | Catalogue par rôle : `GET /v1/me/dashboard/catalog` ; `PUT` refuse un genre interdit au rôle (403) ; dispositions par défaut par rôle (4 rôles) avec les nouveaux genres | Tests API : catalogue par rôle ; développeur ne peut pas poser « Progression du sprint » ; l'administrateur voit tout ; défauts sans chevauchement |
| T-0171 | § 2.1 | Grille 2D en vue : composant `DashboardGrid` (positions, lignes de 88 px, une colonne sous 720 px dans l'ordre y puis x), cartes existantes placées ; mode vue seul | Tests web du rendu et de l'ordre mobile ; e2e : l'accueil des 4 rôles s'affiche sans chevauchement ; axe sur l'accueil (thèmes × modes) |
| T-0172 | § 2.1, § 2.2 | Mode édition : grille en pointillés, tiroir Catalogue, glisser-déposer par pointeur avec aperçu, équivalent clavier (flèches, « Ajouter »), annonces `aria-live`, engrenage (titre, projet, taille, période), retrait, Annuler / Enregistrer / Rétablir | Tests web souris et clavier ; e2e : ajouter deux exemplaires d'un genre pour deux projets, déplacer, enregistrer, recharger ; annuler restaure ; utilisateur sans widget interdit au catalogue |
| T-0173 | § 2.3 | Ligne commune et états vides : refonte de Mes tickets, En retard, Chemin critique, Risques, À valider, Favoris, Récents (identifiant mono, titre tronqué, pastille) ; état vide (illustration grise, phrase, bouton d'action) pour chaque genre | Tests web par genre et par état ; contraste des pastilles (thèmes × modes) ; aucune information portée par la couleur seule |
| T-0174 | § 2.3, § 2.5 | Pilotage : `GET /v1/projects/:p/kpis` ; widgets Informations générales, Avancement global (arc), Indicateurs clés, Santé du projet (grand chiffre), Progression du sprint (anneau) | Tests API : agrégats exacts sur le projet NOVA (retards, échéances, charge, vélocité, bloqués) ; tests web des quatre états du projet ; e2e : chiffres de la Santé = recherche « bloquants » |
| T-0175 | § 2.3, § 2.5 | Pipelines CI/CD : lecture des pipelines GitLab (12 dernières exécutions par dépôt, taux), cache court, widget avec exécution en cours animée | Tests API (simulateur GitLab) ; test web ; animation coupée sous `prefers-reduced-motion` ; état vide « Relier un dépôt » |
| T-0176 | § 2.3, § 2.5 | Qualité du code et Badges : contrat `GET /v1/projects/:p/quality` (réponse « non relié » sans fournisseur), widgets, badges GitLab et versions actifs, badges SonarQube masqués sans connexion | Tests API (contrat, non relié) ; tests web des états ; état vide « Relier SonarQube » avec lien vers l'administration |
| T-0177 | § 2.4 | Galerie de test des widgets (chaque genre × quatre états du projet × deux thèmes) pour les références visuelles ; démonstration LUMEN complétée (pipelines, états) dans `dev-start` | Captures de référence relues ; démonstration lancée et accueil vérifié par rôle |
| T-0178 | — | Vérification du lot critère par critère (`LOT13-VERIFICATION.md`) : captures, axe-core par thème sur les écrans modifiés, e2e complet, mesure du rendu à 24 widgets, mise à jour de `docs/user/GUIDE.md` | Tous les critères tenus ou écart accepté explicitement |

## Hors lot
- Connexion réelle à SonarQube (jeton OpenBao, synchronisation) : lot 14 proposé.
- Indicateurs financiers (budget consommé, reste à faire) : refusés par le demandeur.
- Redimensionnement libre des widgets (tailles prédéfinies seulement).
