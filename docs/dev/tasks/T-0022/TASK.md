# T-0022 : worker unique (historique, webhooks sortants, sessions)
- Livre : boucle tolerante aux pannes (recul exponentiel plafonne, retour a la normale au premier succes, arret propre), cycle webhooks multi-organisations (mise en file puis livraison), purge des sessions expirees, sonde de sante /healthz (503 si une boucle echoue 5 fois de suite ou nest plus executee), arret propre sur SIGINT/SIGTERM. Les services non configures (GitLab, OpenBao) ne demarrent pas leur boucle ; en production OpenBao est obligatoire.
- Verifie en lancant le vrai processus contre le Postgres, GitLab et OpenBao de dev : 3 boucles, sante 200.
- Tests : 6 ; 186 au total pour lAPI.
- Non fait : metriques Prometheus, verrou pour plusieurs instances du worker (les files utilisent for update skip locked cote webhooks ; lhistorique doit rester a une instance), secret de session depuis OpenBao, deconnexion back-channel.
