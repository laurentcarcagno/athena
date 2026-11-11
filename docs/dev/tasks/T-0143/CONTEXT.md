# Journal de la tâche T-0143

## Fait
- Rapports : `ReportsPage` passe ses onglets au rapport ouvert, qui les affiche sous son propre en-tête (les actions de l'en-tête, comme « Ajouter une règle », restent en place) ; l'Avancement s'intitule « Avancement » (et non plus « Tableau de bord »).
- Téléphone : les onglets d'état (fiche, paramètres) défilent dans leur rangée comme les onglets de liens ; chaque onglet porte sa ligne (le soulignement décalé de 2 px aurait été rogné par le cadre défilant).
- e2e `ergonomie.spec.ts` (nouveau, lot 11) : onglets sous l'en-tête, centre de l'onglet « Activité » non recouvert, clic ; fiche à 390 px sans débordement, onglets défilants.
- Préparation e2e : l'étape OTP du flux de connexion est désactivée le temps des tests quand `admin.dev` a un TOTP enregistré, puis rétablie (commit séparé).
- Vérifications : lint ; web 447/447 ; `tsc` ; e2e ergonomie 2/2.

## Décisions et pièges
- La cause du masquage : les onglets étaient rendus avant l'en-tête collant de la page du rapport.
