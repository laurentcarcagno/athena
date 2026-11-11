# Journal de la tâche T-0145

## Fait
- Paramètres > Automatisations : phrase d’explication, « Nouvelle automatisation », modèles « Pour commencer », liste (nom, quand, si, alors, état Active / En pause, activer ou mettre en pause).
- Formulaire : nom ; Quand (créé, modifié, change de statut, commentaire ajouté, code lié, à intervalle régulier avec fréquence heure / jour / semaine) ; Si (condition ATQL, obligatoire pour une règle planifiée, aide) ; Alors : jusqu’à 10 actions (commenter, passer une transition, modifier un champ). Le bouton de création reste inactif tant qu’un champ manque. Corps envoyé = schéma de l’API (`ruleBody`).
- Modèles : bug bloquant signalé (création + `severity = bloquante` → commentaire), vérification à planifier (changement de statut + `status = approved` → commentaire), relance des tickets bloqués (chaque jour + `status = blocked` → commentaire).
- Tests : `automation-editor.test.tsx` (4).

## Décisions et pièges
- La proposition acceptée (B4) prévoit un formulaire « avec les événements et actions déjà gérés par l’API ». Les libellés d’exemple de la maquette (« notifier le rapporteur », « créer la tâche de vérification ») supposaient des actions que l’API n’a pas : les trois modèles retenus utilisent les actions existantes (commenter, transition, modifier). Ce n’est pas un écart à la proposition acceptée.
