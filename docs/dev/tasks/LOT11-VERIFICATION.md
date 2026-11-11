# Lot 11 : vérification critère par critère

Chaque critère d'acceptation de `LOT11-PLAN.md` (T-0142 à T-0156), avec la preuve qui le couvre. Journaux par tâche : `T-0142` à `T-0156/CONTEXT.md`. Décisions : `docs/dev/DECISIONS/ADR-0005-ergonomie-et-cartes.md`. Revue d'origine : page de relecture de l'audit d'ergonomie (avis enregistrés le 2026-11-11 : 17 propositions, 2 principes, 6 cartes, toutes acceptées).

Résultats de la vérification (2026-11-11) : API 610 tests (7 ignorés) ; `@athena/ui` 56/56, `lint-design` et `validate-design --strict` OK ; `@nuance/theming` 19/19 ; `@nuance/themes` : 9 thèmes conformes, 78 paires ; web 477/477 et `tsc` sans erreur ; comparaison visuelle : 11 écrans sur 12 modifiés par le lot, relus puis repris comme référence, **96 sur 96** identiques à la nouvelle référence (seconde passe) ; e2e en suite complète : **60 sur 60** (3 ignorés : captures et aperçus, lancés à part ; 10 minutes, GitLab démarré) ; axe-core : 9 thèmes × 2 modes × 12 écrans (dont l'Avancement, la Recherche, le Backlog, la Roadmap, l'index des boards et les Automatisations) sans violation.

## T-0142 Session et limitation de débit (B1)
| Critère | Preuve |
|---|---|
| Lectures de session dans la limite générale | `hardening.test.ts` (limites réduites 5 / 2 : six lectures de session donnent cinq 200 puis un 429, le seau des connexions reste intact) |
| Un 429 n'est jamais une déconnexion : message, nouvel essai selon `Retry-After`, « Réessayer maintenant » | `session-busy.test.tsx` (aucune redirection vers la connexion, compte à rebours, nouvel essai) ; `RateLimitedError` pour tous les appels |
| e2e vert | Suite complète |

## T-0143 Onglets (B2, B3)
| Critère | Preuve |
|---|---|
| Onglets des rapports visibles et cliquables, titre = rapport ouvert | e2e `ergonomie.spec.ts` (onglets sous l'en-tête, centre de l'onglet non recouvert, clic, titre) |
| À 390 px, largeur du document = 390 sur la fiche | e2e `ergonomie.spec.ts` (`scrollWidth` ≤ 390, onglets défilants) ; capture visuelle 375 px |

## T-0144 Droits manquants (B5)
| Critère | Preuve |
|---|---|
| « Accès réservé » : qui peut agir, comment demander, retour | `access-notice.test.tsx` (5 cas) |
| Entrées masquées selon le rôle | « Ajouter un tracker » déjà réservé aux administrateurs (Projets, Paramètres > Trackers) ; tests de navigation par rôle |
| Section ou rapport non autorisé = message, plus de bascule silencieuse | `access-notice.test.tsx`, `web9.test.tsx` (rapport inactif) ; e2e `ergonomie.spec.ts` (chef de projet sur `/trackers/new` et `/parametres/trackers/BUG`) |

## T-0145 Automatisations (B4)
| Critère | Preuve |
|---|---|
| Formulaire « Quand / Si / Alors », 3 modèles réalisables, explication, liste avec activation | `automation-editor.test.tsx` (4 cas) |
| e2e : un administrateur crée une règle depuis un modèle, elle apparaît active | e2e `ergonomie.spec.ts` |
| Modèles réalisables | Les modèles utilisent les actions de l'API (commenter, transition, modifier) ; la proposition acceptée prévoyait « les événements et actions déjà gérés par l'API » (`T-0145/CONTEXT.md`) |

## T-0146 Nouveau ticket (O1)
| Critère | Preuve |
|---|---|
| « Annuler » et « Créer le ticket », obligatoires et description d'abord, « Plus de champs (n) », « Moi », exemple de titre, Entrée / Échap | `create-dialog.test.tsx` |
| e2e création vert | e2e `creation.spec.ts` |

## T-0147 Filtres du tracker (O2, O12)
| Critère | Preuve |
|---|---|
| Aucun bouton sans texte dans la barre ; vue, colonnes et requête avancée dans la barre | `web10.test.tsx` (« une seule barre ») |
| À 390 px, le tableau commence dans le premier écran ; « Filtres » déplie le reste | e2e `ergonomie.spec.ts` (téléphone) |
| e2e verts | `controles.spec.ts` (anneau de focus des puces, défaut corrigé en passant), suite complète |

## T-0148 Fiche (O4)
| Critère | Preuve |
|---|---|
| Priorité affichée = champ | `item-sheet.test.tsx` (champ sans rôle sémantique) |
| « M'assigner », « + Ajouter », « Enregistrement automatique », marquage en badge | `item-sheet.test.tsx` ; e2e `ergonomie.spec.ts` (« + Ajouter » mène au champ) |
| Conflit 409 : saisie conservée et proposée | `web.test.tsx` (« Enregistrer ma version », « Garder la version actuelle ») |

## T-0149 Recherche (O5)
| Critère | Preuve |
|---|---|
| Mots → `text ~`, clé → ouverture, « Requête avancée (ATQL) », titre « Recherche » | `global-search-page.test.tsx` ; e2e `ergonomie.spec.ts`, `recherche.spec.ts` |

## T-0150 Board, Backlog, Roadmap (O6, O7, O8)
| Critère | Preuve |
|---|---|
| Dernier board ouvert directement, index en cartes | `board.test.tsx` ; e2e `board.spec.ts` |
| Burndown à venir, dates en clair, planifier un sprint | `dates-timeline.test.tsx` ; e2e `backlog.spec.ts` |
| Frise datée avec repère du jour | `dates-timeline.test.tsx` ; e2e `roadmap.spec.ts` |

## T-0151 Membres et Administration (O9, O10)
| Critère | Preuve |
|---|---|
| « Ajouter au projet », « Retirer… » confirmé, accès avancé replié | `members-panel.test.tsx` |
| Tableau des projets et « Nouveau projet » | `web3`, `web4`, `web18` ; e2e `parcours.spec.ts`, `gabarits.spec.ts` |

## T-0152 Projets et microcopie (O11)
| Critère | Preuve |
|---|---|
| Projets en cartes (trackers, tickets ouverts, boards, Ouvrir, favori) | `web.test.tsx`, `web4.test.tsx` ; e2e `navigation.spec.ts`, `parcours.spec.ts` |
| Aucun état ni étiquette en anglais dans les textes français | `vocabulaire.test.ts` (étendu) |

## T-0153 Modèle de carte commun
| Critère | Preuve |
|---|---|
| `DashCard` et grille 12 colonnes S / M / L / XL, hauteur commune | `dashboard-cards.test.tsx` ; jeton `size.dashcard` dans les 9 thèmes |
| Migration 057, disposition par page, largeur | `dashboard.test.ts` (API) |
| Mon travail : « Rien d'urgent », « Me l'assigner » ; Vue d'ensemble migrée | `dashboard-cards.test.tsx` ; captures visuelles |
| Aucune carte de grille sans le modèle commun | Mon travail, Vue d'ensemble, Avancement et widgets d'extension rendus par `DashCard` ; la carte Trackers de la Vue d'ensemble alignée pendant cette vérification (commit b695397) |

## T-0154 Organiser
| Critère | Preuve |
|---|---|
| Glisser-déposer, clavier, largeur, « + Ajouter une carte », retour au défaut | `Dashboard.test.tsx`, `dashboard-cards.test.tsx` (souris et clavier, axe en mode Organiser) |
| e2e : déplacer et redimensionner, retrouvé au rechargement | e2e `ergonomie.spec.ts` (souris), `tableau-de-bord.spec.ts` (clavier) ; défaut de concurrence corrigé (seule la dernière réponse s'applique) |

## T-0155 Avancement en cartes
| Critère | Preuve |
|---|---|
| Indicateurs A, flux cumulé A, vélocité A (message sans sprint), prochaine version C, trackers B, activité A | `web2.test.tsx`, `progress-cards.test.tsx` ; capture visuelle de l'Avancement |
| API : activité sans doublon, auteur et changement | `report.test.ts` (une ligne par ticket, ordre) ; carte d'activité sur le journal (auteur, changement) |
| axe sur l'Avancement dans chaque thème | e2e `themes.spec.ts` |

## T-0156 Cartes graphiques
| Critère | Preuve |
|---|---|
| Anneau, barres, indicateur ; « Autres » au-delà de 7 valeurs | `chart-card.test.tsx` ; `atql.test.ts` (`groupBuckets`) |
| `GET /v1/search/facets` : mêmes droits que la recherche | `atql.test.ts` (même préparation, champ invalide, isolation des organisations) |
| e2e : ajouter un anneau par statut | e2e `ergonomie.spec.ts` |

## Écarts
Aucun écart ouvert.
