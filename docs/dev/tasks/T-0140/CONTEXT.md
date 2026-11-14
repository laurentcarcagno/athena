# Journal de la tâche T-0140

## Fait
- Palettes de la vague 2 (`palette.json`, teintes d'origine, sources et licences) : Solarized (MIT), Dracula / Alucard (MIT), Tokyo Night / Day (Apache-2.0), Rosé Pine / Dawn (MIT) ; `theme.json` dérivés par `node tools/derive.mjs <thème>/palette.json`.
- `derive.mjs` : texte, titre, texte secondaire et atténué rendus lisibles sur toutes les surfaces où ils se posent, l'en-tête de tableau (`surface.muted`) compris ; les thèmes de la vague 1 ont été re-dérivés (quelques nuances de texte légèrement renforcées, Athena inchangé).
- Web : CSS des quatre thèmes chargés à la demande (`THEME_CSS`) ; ils apparaissent d'eux-mêmes dans le Profil et dans Administration > Apparence (catalogue généré).
- `NOTICE`, `README.md` de `@nuance/themes`, `docs/admin/INSTALLATION.md` (thèmes possibles pour la page de connexion).
- Vérifications : 9 thèmes conformes (78 paires) ; `@athena/ui` 55/55 ; web 445/445 ; axe-core 9 thèmes × 2 modes × 6 écrans sans violation ; aperçus clair et sombre relus (`APERCU=1`) ; comparaison visuelle 96/96 ; suite e2e complète 51/51 (le test d’apparence décoche désormais aussi les thèmes de la vague 2).

## Reste à faire
- Rien. Suivante : T-0141 (vérification du lot).

## Décisions et pièges
- Les variantes claires officielles (Alucard, Day, Dawn) tiennent le mode clair ; Solarized garde ses accents dans les deux modes, avec des textes renforcés pour tenir 4,5:1 (dans le Solarized d’origine, `base00` sur `base3` ne fait que 4,12:1).
- On ne retouche jamais un `theme.json` dérivé : corriger la palette ou `derive.mjs`, puis relancer la dérivation.
