# T-0207 : portée de tableau de bord portfolio:<clé> (B24)

- Migration 072 : portée `portfolio:<clé>` de `dashboard_layout`. API : `?portfolio=<clé>` sur `/v1/me/dashboard` (get, put, delete) ; genres `portfolio-health` et `portfolio-tiles` réservés à admin, PMO et directeur (catalogue et 403 sur la portée) ; ces genres ne se posent que dans une portée de portefeuille, et seuls eux ; défaut : tuiles puis tableau.
- Web : `Dashboard` accepte `portfolio` ; `/portefeuilles/:clé` affiche le tableau de bord organisable (Organiser, ajout, retrait) pour admin, PMO et directeur, et le tableau de santé fixe pour le chef de projet. `PortfolioHealthTable` a une vue `table` ou `tiles` (en carte, les tuiles mènent à la page du portefeuille).
- Tests : `dashboard.test.ts` (portée, catalogue, refus), web 639/639. Limite : la carte contient sa propre carte (double cadre), à affiner avec la page du lot.
