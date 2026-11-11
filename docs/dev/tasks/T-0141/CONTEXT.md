# Journal de la tâche T-0141

## Fait
- `LOT10-VERIFICATION.md` : chaque critère du plan avec sa preuve (test, e2e, capture ou recherche dans le code).
- Aperçus : `apercu-themes.spec.ts` capture chaque thème × mode à 375, 768, 1024 et 1440 px (72 captures dans `e2e/visuel/apercu/`, hors dépôt).
- Écart trouvé et comblé : le critère de T-0131 citait le lint pour les tailles de police, couches et transitions en dur ; seul un test le tenait. Règles ajoutées au lint (commit 8fb5b9a).
- Vérifications : moteur 19/19 ; 9 thèmes conformes (78 paires) ; `@athena/ui` 56/56, lint et charte ; web 445/445, `tsc` ; API du lot 25/25, `tsc` ; visuel 96/96 ; e2e 51/51 ; aperçus 72.

## Reste à faire
- Rien. Captures relues et validées par l'utilisateur le 2026-11-11 (critère de T-0132).

## Décisions et pièges
- Lancer les aperçus après `node global-setup.mjs` : après une suite e2e, `global-teardown` remet le TOTP de `admin.dev` et la connexion bloque.
- 2026-11-11 : après un redémarrage de Docker, le disque D: (amovible) n'était plus monté dans WSL ; montage à la main (`mount -t drvfs D: /mnt/host/d` dans `docker-desktop`) et conteneurs Keycloak et `openbao-init` recréés.
