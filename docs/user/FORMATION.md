# Parcours de formation Athena

Trois sessions courtes, chacune avec un exercice à faire dans un projet de formation (jeu de données : tracker `BUG` du modèle fourni).

## Session 1 : utilisateur (1 h)
Objectifs : trouver, créer, faire avancer un artefact.
1. Connexion, sélecteur de langue, palette de commandes (Ctrl+K).
2. Liste, tri, recherche ATQL (`status = open AND severity = majeure`), filtre enregistré, autocomplétion.
3. Créer un artefact, modifier un champ, appliquer une transition, lire l'historique et restaurer une version.
4. Commentaires, liens, pièces jointes.
5. Board : déplacer une carte (souris et clavier), couloirs par responsable.
Exercice : créer 3 bugs, lier l'un à un autre (`bloque`), le déplacer jusqu'à « Terminé », retrouver la révision dans l'historique.

## Session 2 : pilote de projet (1 h)
1. Sprints : planifier, démarrer, burndown, clôturer ; versions et roadmap (Gantt).
2. Tableau de bord, vélocité, flux.
3. Intégration GitLab : clés dans les messages de commit, branche et merge request depuis une fiche, déploiements, rétroportages, notes de version.
4. Documentation StrictDoc : liens, liens suspects, couverture, report par merge request.
Exercice : un commit `BUG-1: …` fait passer l'artefact « En revue » ; produire les notes de version d'une version.

## Session 3 : administrateur (2 h)
1. Configuration d'un tracker : champs, statuts, transitions, rôles par champ et par transition, mode d'historique (direct ou merge request), aperçu d'impact avant suppression d'un champ.
2. Webhooks sortants et entrants (signature HMAC, rejeu), automatisations (événements et planifiées).
3. Plugins : installation signée, permissions, actions, widgets, connecteurs, désinstallation.
4. Import JIRA/Tuleap (simulation puis import), baselines, reconstruction depuis Git.
5. Exploitation : sauvegardes, journal d'audit, CLI `athena`, recette (voir `docs/admin/INSTALLATION.md`).
Exercice : créer un tracker « Demandes » avec un champ `budget` visible du seul rôle `finance`, vérifier qu'un utilisateur sans ce rôle ne le voit ni dans la fiche, ni dans la recherche, ni dans le board.

## Évaluation
Chaque exercice se valide par un contrôle fonctionnel (artefact dans l'état attendu, absence de fuite de champ restreint). Une session de rappel est conseillée après un mois d'usage.
