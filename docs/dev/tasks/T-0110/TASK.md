# T-0110 : navigation mobile (Lot 9, lot A2)

- **Objectif** : sous 768 px, la navigation du projet reste à portée sans ouvrir le tiroir, et les destinations globales sont dans une barre basse (ADR-0003 § 2.3).
- **Critères d'acceptation** (testables) :
  1. Dans un projet, le sélecteur « <clé> · <section> » liste les sections visibles (même source que le rail) en liens, signale la section courante, se ferme sur Échap (focus rendu) et au changement de page.
  2. La barre basse propose Mon travail, Projets, Chercher (palette, focus dans le champ) et Menu (tiroir du rail).
  3. À 390 px : cibles ≥ 44 px, vues du tracker sur une ligne, aucun défilement horizontal de la page, contenu non masqué par la barre.
  4. Sur poste de travail : ni sélecteur ni barre basse.
- **Fichiers concernés** : `components/MobileNav.tsx` (nouveau), `components/Rail.tsx`, `App.tsx`, `pages/project/ProjectShell.tsx`, `components/CommandPalette.tsx`, `i18n.ts`, `packages/ui/src/styles.css`, tests.
- **Hors périmètre** : création contextuelle (T-0111), recherche globale (T-0119).
- **Dépendances** : T-0109.
