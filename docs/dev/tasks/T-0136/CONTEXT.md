# Journal de la tâche T-0136

## Fait
- **Thèmes** : `base` (abstrait : typographie, espacements, tailles, couches, mouvement, surcouches inverses, rayon et élévation nuls) ; Athena en hérite. `tools/derive.mjs` dérive Catppuccin (Latte, Mocha), Nord, Gruvbox et Contraste élevé de leur `palette.json` : teintes conservées, clarté ajustée jusqu'aux seuils du contrat (7:1 pour les textes de Contraste élevé, marqué `meta.aaa`). Rayon 6/8 px (Catppuccin), 4 px (Nord), 2 px (Gruvbox), 0 (Athena, Contraste élevé) ; ombre douce des couches flottantes sauf Athena et Contraste élevé. `NOTICE` (MIT, MIT/X11).
- **Moteur** : les thèmes abstraits ne sont pas contrôlés (seulement leurs héritiers).
- **CSS** : `themes.generated.css` (Athena, toujours chargé) + `themes/<nom>.generated.css` (chargé à la demande) + `themes.catalog.generated.ts` (aperçus) ; rayon (`--ath-radius-control`, `--ath-radius-surface`) et ombre (`--ath-elevation-overlay`) consommés par contrôles, cartes, modales, menus ; lint : rayon et ombre seulement par jetons.
- **API** : migration 054 (`organization_appearance` : thème par défaut, thèmes proposés ; `user_preference.theme_family`) ; `GET /v1/appearance`, `PUT /v1/admin/appearance` (administration) ; préférence `family`.
- **Web** : famille de thème dans le contrôleur, CSS chargé avant de poser `data-theme` ; liste restreinte par l'organisation ; Profil : vignettes SVG (aucun style en ligne) en boutons radio, enregistrées sur le compte ; le réglage clair / sombre / système s'appelle « Mode » ; Administration > Apparence.
- **Tablette** : rail replié en icônes (icônes sur toutes les entrées, libellés en info-bulle et nom accessible), replié par défaut entre 769 et 1024 px tant que l'utilisateur ne l'a pas déplié ; panneau de détail en superposition.
- Vérifications : thèmes conformes (5) ; moteur 20/20 ; `@athena/ui` 52/52 ; web 439/439 ; API apparence et préférences 13/13 ; e2e `themes.spec.ts` : 60 audits axe sans violation, tablette mesurée (rail 64 px, panneau fixe), parcours d'apparence ; suite complète et référence visuelle (voir STATE).

## Reste à faire
- Rien. Suivante : T-0137 (icône de marque par thème, téléversement sécurisé).

## Décisions et pièges
- Le CSS d'un thème non par défaut est importé dynamiquement (Vite le découpe) ; en développement, Vite l'injecte en `<style>` (sans effet en production, où c'est un `<link>`).
- Fichiers en fins de ligne CRLF (`Rail.tsx`…) : un remplacement multiligne doit normaliser les fins de ligne.
- `e2e/tests/apercu-themes.spec.ts` (APERCU=1) produit des aperçus de chaque thème pour relecture (`e2e/visuel/apercu/`).
