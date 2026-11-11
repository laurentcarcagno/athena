# Journal de la tâche T-0144

## Fait
- `AccessNotice` : état vide de la charte avec titre (ce qui est réservé et à qui), aide (« Décrivez votre besoin à un administrateur… ») et lien de retour ; `whoOf` dit les rôles en clair (« aux administrateurs, aux chefs de projet et à l’assurance qualité »).
- Paramètres : sans section autorisée, message et retour au projet ; section connue mais réservée (ex. Trackers pour un chef de projet, `/parametres/trackers/BUG`) : message à l’adresse demandée, retour à la première section autorisée. Une section inconnue mène toujours à la première autorisée.
- Rapports : rapport connu dont le module est inactif (ex. Conformité) : message et retour aux rapports, au lieu d’afficher l’Avancement à sa place.
- Ajouter un tracker (non administrateur) et Administration de l’organisation (non administrateur) : même composant.
- Entrées : les liens « Ajouter un tracker » étaient déjà réservés aux administrateurs (Projets, Paramètres > Trackers) ; rien à masquer en plus.
- Tests : `access-notice.test.tsx` (5) ; 9 tests existants mis à jour (anciens messages « Réservé aux… », bascule silencieuse du rapport). e2e : chef de projet sur `/trackers/new` et `/parametres/trackers/BUG`.

## Décisions et pièges
- Les textes sont sous `fr.denied` : `fr.access` désigne déjà le besoin d’en connaître.
- Le message ne nomme pas les administrateurs : la liste des comptes n’est lisible que par eux.
