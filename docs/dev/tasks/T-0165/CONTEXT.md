# Journal de la tâche T-0165

## Fait
- ATQL : `late()` (échéance dépassée et statut non terminé ; faux, jamais « inconnu », pour un ticket sans date ou sans rôle), `critical()` (le chemin critique du moteur de dates, résolu par `SearchService` pour les projets du périmètre ; refusé hors recherche, ex. automatisations), champs `startDate` et `dueDate` (champ porteur du rôle, comparaison de dates, `IS EMPTY`, tri). Aucune valeur concaténée dans le SQL.
- `GET /schedule` expose aussi le statut (clé, nom, catégorie, teinte) et le responsable de chaque tâche.
- Planning : quatre onglets (Gantt, Board, Liste, Versions). Recherche (`?q=`), critère (`?f=` : en retard, chemin critique, jalons, mes tâches), chemin critique et baseline sont dans l'adresse et suivent d'un onglet à l'autre (Versions les laisse de côté). Les parents des tâches retenues restent.
- Board du planning : colonnes par catégorie de statut, en lecture (le changement de statut passe par la fiche). Liste : clé, titre en hiérarchie, statut, début, fin, durée, marge (avec « Critique »), avancement, reste à faire.
- Section Planification dans la fiche et le panneau de détail (même `ArtifactView`) pour les trackers qui portent un début et une échéance : dates, durée, marge, prédécesseurs et successeurs (liens ordonnés avec décalage), avancement, reste à faire. Chef de projet : début et durée modifiables (replanification, « n tickets déplacés »). Chacun : avancement et reste à faire de ses tickets (responsable = personne connectée) ; un tiers voit des valeurs. Tâche parente : lecture. Ces quatre champs ne se répètent plus dans Détails.
- Tests : API 683 verts (ATQL planning : 9) ; web 534 (`planning-views.test.tsx` : 18).

## Décisions et pièges
- « Sur ses tickets » est une règle d'interface (le serveur ne distingue pas le responsable pour l'écriture d'un champ) ; les permissions par champ restent la protection côté serveur.
- `critical()` coûte un calcul de planning par projet du périmètre ; sans `critical()` dans la requête, le moteur n'est pas appelé.
