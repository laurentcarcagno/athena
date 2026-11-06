# Journal de la tâche T-0052

## Fait
- Fiche artefact : une adresse à ancienne clé est remplacée (historique remplacé) par l'adresse canonique ; la clé de l'en-tête est en mono et insécable (`PageHeader` accepte un nœud pour `title`, classe `ath-nowrap`).
- Palette : recherche par clé exacte (alias compris), préfixe de clé ou titre.
- Documentation : GUIDE, FORMATION, REFERENCE (section « Clés d'item »), INSTALLATION (« Montée de version : clés d'item », procédure `migrate-keys`).
- e2e : clés du parcours passées à `ARI-BUG-0001`.
- Tests : web2 (redirection d'alias, requête de palette).

## Reste à faire
- Rejouer les e2e (Playwright) : non exécutés dans cette session, les ports 3000/3001 étaient occupés par le serveur de développement de l'utilisateur. Le parcours d'alias n'a pas de test e2e (aucun alias dans le jeu de données e2e) ; il est couvert par le test web.

## Décisions et pièges
- Fin du Lot 0 : arrêt et compte rendu demandés avant le Lot 1.

## Commandes utiles
- `pnpm exec turbo run lint typecheck test --force --filter='!@athena/e2e'`

## Prompt de reprise
Lire `docs/dev/STATE.md` ; si le Lot 1 est ouvert, commencer par T-0097 (types de tracker d'organisation, API).
