# T-0202 : tests de visibilité des agrégats (B19)

- `ppm/health.test.ts` : un lecteur hors liste d ayants droit ne trouve du projet masqué ni ligne, ni total, ni nombre, ni date, ni sponsor, ni risque (recherche de traces dans le JSON). `summary` était déjà couvert par `team-portfolio.test.ts`. Les tuiles (T-0204) et l export (T-0205) reprendront ce test sur leurs propres sorties.
