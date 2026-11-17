# T-0208 : rappel de météo (B25)

- Migration 073 : événement `weather` des notifications et des réglages. `ppm/weather-reminder.service.ts` : pour chaque chef d un projet actif sans météo (ou projet sans météo plus vieux que N jours) depuis `statusNoteStaleDays` jours (réglage PPM, 30 par défaut), une notification ; une seule par période (aucune relance tant que la dernière a moins de N jours) ; réglage `weather` désactivé respecté. Boucle `météo` du worker (toutes les heures).
- Web : libellé et phrase de l événement, réglage dans les notifications, la notification mène au projet. Digest : ligne sans clé.
- Tests : `ppm/weather-reminder.test.ts`.
