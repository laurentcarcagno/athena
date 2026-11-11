# Journal de la tâche T-0146

## Fait
- Pied de la fenêtre : « Entrée pour créer · Échap pour annuler » à gauche, « Annuler » et « Créer le ticket » nommés à droite (plus de boutons-icônes sans texte).
- Champs : obligatoires et description d'abord ; les autres sous « Plus de champs (n) : … » (liste des libellés, `aria-expanded`), repliés à chaque ouverture.
- Responsable (champ de type `user`) : bouton « Moi » ; le compte choisi s'affiche « Vous (Nom) » avec « Changer » ; la valeur envoyée reste l'identifiant du compte (`sub`). `currentUser()` vient de la session chargée.
- Titre : exemple en indication (« Ex. : la télémétrie s'arrête après 2 h »).
- Tests : `create-dialog.test.tsx` (2) ; `create-flow`, `web2` mis à jour ; liste des automatisations tolérante à une règle sans actions. e2e `creation.spec.ts` 3/3.

## Décisions et pièges
- Échap fermait déjà la fenêtre (`Modal`) et Entrée valide le formulaire depuis un champ ; seul le rappel manquait.
