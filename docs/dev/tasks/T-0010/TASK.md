# T-0010 : webhooks sortants (phase 7, anticipé)
- Livré : abonnements par type dEvenement (exact, prefixe, joker), secret de signature dans le coffre (affiche une seule fois), enveloppe versionnee, signature HMAC-SHA256 avec horodatage, livraison at-least-once avec reessais et backoff, abandon puis desactivation du point de terminaison, journal des livraisons, rejeu, protection SSRF au niveau connexion (DNS et IP litterales).
- Constat de test : une IP litterale contournait la resolution DNS ; corrige et teste.
- Tests : 25 (77 au total pour lAPI).
- Non fait : routes REST dadministration, filtres ATQL, webhooks entrants, ordre garanti par artefact, branchement du SecretStore sur OpenBao KV, tableau de bord de livraisons.
