# T-0040 : extensions de plugins

- Manifeste : `contributes.actions` et `contributes.widgets` ; runner et hôte (seul le déclaré est exposé).
- Service : runAction, widget, uninstall (refus si type de champ utilisé ; keepData). Routes REST associées.
- Correctif : le manifeste stocké est celui signé (les défauts zod invalidaient la signature au redémarrage).
- Reste : vues, connecteurs ; rendu des widgets dans le tableau de bord ; action de workflow déclenchée par transition.
