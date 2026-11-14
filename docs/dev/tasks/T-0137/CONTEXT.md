# Journal de la tâche T-0137

## Fait
- Icônes par défaut : `base/mark.svg` (hérité par les thèmes communautaires) et `athena/mark.svg` (liseré tricolore) ; le générateur les met au catalogue en URI `data:` (CSP `img-src 'self' data:`), `currentColor` remplacé par le texte sur surface inverse du thème.
- API : migration 055 (`organization_brand` : thème ou `*`, `mark` | `logo`, type, taille ≤ 64 Ko) ; `checkBrandImage` (type reconnu par les octets : PNG, WebP, SVG) et `sanitizeSvg` (liste blanche d'éléments et d'attributs, refus de `script`, `foreignObject`, `style`, DOCTYPE et entités, retrait des gestionnaires d'événement, des liens hors document et des schémas `javascript:`/`data:`) ; stockage S3 ; `GET /v1/brand`, `GET /v1/brand/:theme/:kind` (type strict, `nosniff`, `sandbox`), `PUT` et `DELETE /v1/admin/brand/:theme/:kind` (administration).
- **Défaut corrigé** : le crochet de durcissement écrasait la CSP propre à une route : la CSP `sandbox` des pièces jointes téléchargées était perdue. Elle est désormais gardée et complétée de `frame-ancestors 'none'` ; un `Cache-Control` explicite est respecté (test ajouté).
- Web : `Sidebar` accepte une marque (icône + nom ; icône seule en rail replié) ; `lib/brand.ts` (icône du thème, téléversée ou par défaut ; favicon qui suit le thème) ; Administration > Apparence : téléversement et retrait (avec confirmation) pour tous les thèmes ou par thème.
- **Logo horizontal** (ADR-0004 § 2.7) : facultatif, téléversé par thème ou pour tous les thèmes ; il remplace l'icône et le nom dans le rail déplié ; le rail replié garde l'icône.
- **Écart de contraste corrigé** (trouvé par la suite e2e complète, données des autres tests) : dans Catppuccin et Nord clairs et Gruvbox sombre, le lien et le texte atténué tombaient sous 4,5:1 sur une ligne survolée ou sélectionnée. Le contrat exige désormais ces paires (67 au total) et le dériveur les tient.
- Vérifications : API cœur 247/247, durcissement 5/5, marque 13/13 ; `@athena/ui` 52/52 ; web 441/441 ; e2e : SVG piégé refusé (script) ou nettoyé (onload), servi typé et isolé, affiché par `<img>`, favicon, retrait ; suite complète et référence visuelle (voir STATE).

## Reste à faire
- Rien. Suivante : T-0138 (teintes nommées des statuts).

## Décisions et pièges
- Un élément interdit fait refuser le SVG (message explicite) ; un attribut interdit est retiré sans bruit.
- Le test axe des thèmes passe seul mais dépend des données : le lancer aussi en suite complète.
