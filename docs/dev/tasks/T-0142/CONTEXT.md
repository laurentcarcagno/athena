# Journal de la tâche T-0142

## Fait
- API : `GET /auth/session` passe dans le seau général (600/min par défaut) ; connexion, déconnexion, rappel et webhooks restent dans le seau « sensible » (60/min). Test : avec des limites 5 / 2, six lectures de session donnent cinq 200 puis un 429, et le seau sensible reste intact.
- Web : `RateLimitedError` (statut 429, délai `Retry-After` borné de 1 à 120 s, 20 s par défaut) levée par `loadSession` et par `api()` ; au chargement, l'application affiche « Athena est très sollicité. Votre session est intacte ; nouvel essai automatique dans N s. » avec « Réessayer maintenant », sans jamais renvoyer vers la connexion.
- Vérifications : API durcissement 5/5 ; web 447/447 (dont `session-busy.test.tsx`) ; `tsc` sans erreur ; e2e complet regroupé avec T-0143 et T-0144 (voir STATE).

## Décisions et pièges
- Le critère du plan (« 61 lectures en une minute ») est vérifié avec des limites réduites dans le test (même règle, plus rapide).
- Une écriture refusée par 429 garde le message du serveur (toast) ; seul l'amorçage de la session a un écran dédié.
- Pour lancer les e2e, arrêter d'abord `tools/dev-start.mjs` (ports 3000 et 3001).
