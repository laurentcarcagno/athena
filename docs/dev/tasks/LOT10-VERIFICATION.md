# Lot 10 : vérification critère par critère

Chaque critère d'acceptation de `LOT10-PLAN.md` (T-0126 à T-0140), avec la preuve qui le couvre. Journaux par tâche : `T-0126` à `T-0140/CONTEXT.md`. Décisions : `docs/dev/DECISIONS/ADR-0004-themes.md`.

Résultats de la vérification (2026-11-11) : `@nuance/theming` 19/19 ; `@nuance/themes` : 9 thèmes conformes dans 2 modes, 78 paires de contraste ; `@athena/ui` 56/56 ; `lint-design` et `validate-design --strict` OK ; web 445/445 et `tsc` sans erreur ; API : apparence, marque, préférences, teinte de statut et durcissement 25/25, `tsc` sans erreur ; comparaison visuelle **96 sur 96** identiques à la référence ; e2e en suite complète : **51 sur 51** (3 ignorés : captures et aperçus, lancés à part ; 8 minutes, GitLab démarré) ; aperçus thème × mode × 4 largeurs : **72 captures**, relues par échantillon.

## T-0126 ADR, plan, charte, captures de référence
| Critère | Preuve |
|---|---|
| ADR et plan relus par l'utilisateur | Réponses du 2026-11-10 aux questions de l'ADR (forme par thème, vague 1, gouvernance, noms `@nuance/*`, défauts) puis « commence T-0126 » (`T-0126/CONTEXT.md`) |
| `validate-design --strict` et `lint-design` OK | `pnpm --filter @athena/ui lint` (relancé pour cette vérification) |
| Références prises (12 écrans × 2 modes × 4 largeurs) | `e2e/tests/visuel.spec.ts`, `pnpm visuel` : 96 captures |

## T-0127 Moteur `@nuance/theming`
| Critère | Preuve |
|---|---|
| Alias circulaire refusé | `theming.test.ts` (« refuse un alias circulaire en nommant la boucle ») |
| Paire sous le seuil = échec | `theming.test.ts` (« une paire sous le seuil en donne un, par mode » ; CLI `check` rend 1) |
| Sortie CSS déterministe | `theming.test.ts` (« une sortie déterministe ») |
| Aucune dépendance à `@athena/*` | `theming.test.ts` (« aucun fichier source n'importe un paquet du produit ») ; `@nuance/themes` : données seulement |

## T-0128 Runtime
| Critère | Preuve |
|---|---|
| e2e `theme.spec.ts` vert | Suite complète. Le test a été adapté en T-0129 (le mode passe de `data-theme` à `data-mode`), comme prévu dans `T-0128/CONTEXT.md` ; le comportement vérifié est inchangé |
| Tests du runtime (système, mémoire, événement) | Tests runtime et React de `@nuance/theming` (19/19) ; `apps/web/src/lib/theme.test.tsx` |

## T-0129 Thèmes `@nuance/themes`, Hemeria en DTCG
| Critère | Preuve |
|---|---|
| Valeurs calculées égales à l'ancien CSS | `packages/ui/src/themes.test.ts` contre `__fixtures__/hemeria-legacy.json` (valeurs figées de l'ancien générateur, clair et sombre) |
| Captures identiques | `pnpm visuel` 96/96 en T-0129 (`T-0129/CONTEXT.md`) |

## T-0130 Couleurs en jetons
| Critère | Preuve |
|---|---|
| 0 `--ath-color-*` dans les styles | `themes.test.ts` ; lint (primitive interdite) ; recherche : 0 occurrence |
| Lint vert | `lint-design : OK` |
| Captures identiques | `pnpm visuel` 96/96 en T-0130 |
| axe-core vert dans les deux modes | e2e `theme.spec.ts` ; depuis T-0136, `themes.spec.ts` pour chaque thème |

## T-0131 Typographie, couches, mouvement en jetons
| Critère | Preuve |
|---|---|
| 0 `font-size`, `z-index`, `transition` littéral (lint) | `themes.test.ts` (« aucune … écrite en dur ») ; **règles ajoutées au lint pendant cette vérification** (le critère citait le lint, qui ne les contrôlait pas) et test des règles (`themes.test.ts`) |
| Captures identiques | `pnpm visuel` 96/96 en T-0131 |

## T-0132 Typographie visible
| Critère | Preuve |
|---|---|
| Aucun `text-transform: uppercase` | `typographie.test.ts` ; recherche : 0 occurrence |
| Un seul traitement par niveau de titre | `typographie.test.ts` (classes `.ath-section-title`, `.ath-subsection-title`, `.ath-group-title`) |
| Captures revues par l'utilisateur | Captures relues pendant la tâche puis reprises comme référence ; **la relecture par l'utilisateur reste à faire** : voir « Points soumis à l'utilisateur » |

## T-0133 Contrôles de formulaire
| Critère | Preuve |
|---|---|
| Aucun `<select>` ni case à cocher nus dans `apps/web/src` | Recherche hors tests : 0 `<select>`, 0 `type="checkbox"` |
| e2e verts | Suite complète |
| Focus visible mesuré | e2e `controles.spec.ts` (anneau de 2 px au clavier, hauteurs 32 px) |

## T-0134 Onglets, pastilles, tableau, en-tête
| Critère | Preuve |
|---|---|
| Routes inchangées | Tests de navigation web (445/445) ; e2e `navigation.spec.ts` |
| Flèche de tri ≥ 3:1, libellé de filtre ≥ 4,5:1 | Paires du contrat (`contract.json`), vérifiées pour chaque thème × mode par `@nuance/themes` |

## T-0135 Densité
| Critère | Preuve |
|---|---|
| Compact : 28 px, jamais < 12 px ni cible < 24 px | `density.test.ts` ; e2e `controles.spec.ts` (Compacte mesurée à 28 px) |
| Préférence appliquée sur un navigateur neuf | `global-nav.test.tsx` (« la densité du compte s'applique sur un navigateur neuf ») |

## T-0136 et T-0140 Thèmes des vagues 1 et 2
| Critère | Preuve |
|---|---|
| `theming check` vert pour chaque thème × mode | `@nuance/themes` : 9 thèmes (Hemeria, Contraste élevé (AAA), Catppuccin, Nord, Gruvbox, Solarized, Dracula, Tokyo Night, Rosé Pine), 2 modes, 78 paires |
| axe-core vert sur 6 écrans par thème × mode | e2e `themes.spec.ts` : 9 × 2 × 6 = 108 audits sans violation |
| `NOTICE` des licences | `packages/themes/NOTICE` (MIT, Apache-2.0 pour Tokyo Night) |
| Choix du thème, liste et défaut de l'organisation, palier 1024 px | e2e `themes.spec.ts` (apparence ; tablette : rail de 64 px, panneau fixe) |

## T-0137 Marque
| Critère | Preuve |
|---|---|
| SVG avec `<script>` ou lien externe refusé ou nettoyé | `apps/api/src/core/brand.test.ts` ; e2e `themes.spec.ts` (script refusé, `onload` retiré) |
| Affichage par `<img>` seulement | e2e `themes.spec.ts` (`img.ath-sidebar__mark`, servi avec `nosniff` et CSP `sandbox`) |
| e2e de remplacement d'icône | e2e `themes.spec.ts` (téléversement, favicon, retrait après confirmation, logo) |

## T-0138 Teintes des statuts
| Critère | Preuve |
|---|---|
| Défaut par catégorie (écrans inchangés sans choix) | `pnpm visuel` 96/96 sans reprise de référence en T-0138 |
| Teinte inconnue refusée par l'API | `status-color.test.ts` (« un code couleur ou une teinte inconnue est refusé ») |
| 12 teintes AA dans chaque thème × mode | Paires `hue.*` du contrat, vérifiées pour les 9 thèmes ; e2e `themes.spec.ts` (choix, affichage, effacement) |

## T-0139 Données, surface flottante, connexion
| Critère | Preuve |
|---|---|
| Aucun graphique ne prend l'action ni un signal comme série | `charts.test.ts` |
| Segments ≥ 3:1 | Paires `data.*` sur la carte dans le contrat, pour chaque thème × mode |
| `login.css` généré, sans hexadécimal en dur | `charts.test.ts` (« page de connexion : règles sur jetons seulement ») ; `login.source.css` : 0 hexadécimal |

## T-0141 Vérification du lot
| Critère | Preuve |
|---|---|
| Captures thème × mode × 4 largeurs | `APERCU=1 npx playwright test apercu` : 9 thèmes × 2 modes × 375, 768, 1024, 1440 px (`e2e/visuel/apercu/`, hors dépôt) ; Hemeria est en plus comparé à sa référence sur 12 écrans (`pnpm visuel`) |
| axe-core par thème | Voir T-0136 et T-0140 |
| e2e | Suite complète : 51 sur 51 |

## Points soumis à l'utilisateur
- T-0132 : la relecture des captures par l'utilisateur. Les aperçus de chaque thème sont dans `e2e/visuel/apercu/`.
- Hors lot : `gabarits.spec.ts` dépend de GitLab démarré (voir `T-0128/CONTEXT.md`). Dans cette vérification, il était démarré.
