# Vérification des corrections de l'audit Athena

Source : `design-audit-work/AUDIT_athena.md` (13 constats). Mesures « avant » : `design-audit-work/evidence/`. Mesures « après » : `design-redesign-work/after/` (mêmes scripts, `collect-after.mjs`, `collect2-after.mjs`, `probe*.mjs`). Charte : `ARIANE/DESIGN.md` et `DESIGN.json`, décision D-015.

## Constats corrigés

| Constat | Correction | Preuve après |
|---|---|---|
| F-01 suppressions sans confirmation | Hook `useConfirm` + modale `{component.modal}` avec `{component.button.danger}` : templates de projet, templates de tracker, désinstallation d'un plugin | `web6.test.tsx` ; parcours réel (`probe3.mjs`) : le dialogue s'ouvre, annuler ou `Échap` ne supprime rien et rend le focus au bouton, confirmer supprime (vérifié par l'API) ; `after/confirmation.png` |
| F-02 toasts d'erreur éphémères | Un toast `danger` ne disparaît pas seul ; les autres sont suspendus au survol et au focus | `states.test.tsx` (60 s simulées, erreur toujours présente ; succès suspendu au focus) |
| F-03 `window.confirm` | Remplacé par la même modale | `web2.test.tsx` : le dialogue précède le `DELETE ?purge=true` |
| F-04 pas de lien d'évitement | Lien « Aller au contenu » premier focalisable, `main` focalisable | Premier `Tab` = « Aller au contenu » (`probe.mjs`) ; `web6.test.tsx` |
| F-05 textes sous 11 px | Sous-titre, indicateur de tri, label de stat, pastilles, tags, chips, indice de raccourci à 11 px | `<11px` : 0 sur 11 écrans (avant : 1 à 3 par écran) |
| F-06 cibles basses | Hauteur minimale 24 px des liens de tableau, de carte, de liste et d'en-tête | Petites cibles : 0 sur 9 écrans sur 11 ; reste la coche native 13×13 d'un formulaire (contrôle du navigateur, non modifié) |
| F-07 titre long et clés coupées | Titre tronqué (`.ath-clip`, `title`), clés en `nowrap` | Titre de 140 caractères : `scrollWidth` 1440 pour 1440 (avant 1650) ; `after/liste-contenu-long.png` |
| F-08 pas d'état loading | `Btn loading` (désactivé, `aria-busy`, « … ») + `useBusy` qui ignore un second envoi : création d'artefact, de projet, de tracker, commentaire, « Prendre » | `states.test.tsx` ; double envoi bloqué par le garde (`guard`) |
| F-09 barre latérale et recherche sous 768 px | Navigation repliée derrière « Menu » (`aria-expanded`), champ de recherche et tableaux contenus, en-tête de page qui passe à la ligne | 375 px : `scrollWidth` 375 (avant 497), `after/recherche-375.png` |
| F-10 clés techniques ATQL | Après `champ =`, suggestion des valeurs (statuts avec leur nom, options de listes, trackers) | `web6.test.tsx` ; `after/suggestions-valeurs.png` |
| F-11 raccourci non visible | Page d'aide qui liste `Ctrl+K` (l'en-tête reste sans indice, décision produit) | `after/aide.png` |
| F-12 pas d'aide | Entrée « Aide » en dernière position de la navigation, page `/help` | `web6.test.tsx` |
| F-13 page Administration non réservée | Message « Réservé aux administrateurs. » sans appel réseau | `web6.test.tsx` : 0 appel |

## Vérifications transverses

- **Contrastes** : aucune paire ajoutée ni changée (couleurs inchangées) ; `validate-design.mjs --strict` : 64 paires, 0 écart. axe-core (WCAG 2.0 à 2.2 AA) : 0 violation sur les 11 écrans, avant et après.
- **Ordre de focus** : lien d'évitement, puis navigation, puis contenu ; aucun focus invisible parmi les 14 premiers arrêts de chaque écran ; la modale piège le focus et le rend au déclencheur.
- **Règles de la charte** : 0 arrondi, 0 ombre, 0 dégradé sur 11 écrans ; `lint-design` OK ; les nouveaux composants sont déclarés `proposed` dans `DESIGN.json` (`skip-link`, `confirm-dialog`, `help-entry`, `table.row.clip`).
- **Tests** : `pnpm check` 17 tâches vertes (UI 36 tests, application 74 tests) ; e2e 8 sur 8.
- **Charte synchronisée** : `validate-design --same-as ../ARIANE` OK entre ARIANE et Athena.

## Non vérifié

- **Lecteur d'écran** : le lien d'évitement, le dialogue et `aria-busy` n'ont pas été écoutés (NVDA, VoiceOver).
- **Plugin désinstallé** : le dialogue est vérifié sur un template ; l'écran des plugins utilise le même code mais aucun plugin n'est installé pour l'exercer.
- **Menu mobile** : repli vérifié par capture à 375 px, pas d'ouverture au toucher sur un vrai appareil.
- **Rôles** : les écrans de `user.dev` et `pm.dev` n'ont pas été remesurés après les corrections (aucune modification spécifique à ces rôles, hors F-13 testé).
- **Thème sombre** : absent de l'interface.
- **Coche native** (13×13) : conservée.
