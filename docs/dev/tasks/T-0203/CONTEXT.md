# T-0203 : page santé du portefeuille (B20)

- `components/PortfolioHealthTable.tsx` (dans `/portefeuilles/:clé`) : tableau de `GET /portfolios/:k/health` : santé affichée (pastille libellée, encadrée en pointillés si forcée, avec la santé calculée), déclarée et écart, état du cycle de vie, phase, prochaine revue, fin prévue, avancement, retards, bloqués, risque max, sponsor ; filtres état, santé, projets clos ; mention de périmètre ; états vide et dégradé. Cellules liées : projet, phase, retards (board), risque (rapport Risques).
- Le tableau de gestion existant (santé forcée, note, rattachement) est conservé sous le tableau de santé.
- Écart : « hachure » de la maquette remplacée par des pointillés (charte : aucun dégradé). Pas de navigation clavier spécifique au-delà des liens et contrôles natifs. Tests : `PortfolioHealthTable.test.tsx` (axe vert).
