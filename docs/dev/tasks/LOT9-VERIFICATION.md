# Lot 9 : vérification critère par critère

Chaque critère d'acceptation de `LOT9-PLAN.md` (T-0109 à T-0124), avec la preuve qui le couvre. Journaux par tâche : `T-0109` à `T-0124/CONTEXT.md`. Décisions : `docs/dev/DECISIONS/ADR-0003-ia-cible.md`.

Résultats de la vérification (2026-11-10) : Vitest web 418 sur 418 ; `tsc` web et API sans erreur ; `lint-design` OK ; API : `dashboard`, `backlog`, `saved-search`, `atql` OK ; e2e rejoués en suite complète : **44 sur 44** (11 minutes).

## T-0109 Coquille projet unique
| Critère | Preuve |
|---|---|
| Toute route `/p/:p/*` affiche la navigation du projet | `web9.test.tsx` (« reste affichée sur toutes les adresses du projet, l'entrée courante comprise ») |
| L'entrée courante est signalée (fiche, configuration : le tracker) | `web9.test.tsx` ; `navigation.test.ts` (`placeOf` : tracker d'une fiche à clé canonique, de sa configuration, de `/parametres/trackers/:t`) |
| Aucune entrée visible ne mène à « Réservé » | `web9.test.tsx` (simple membre : ni Paramètres, ni Membres) ; `navigation.test.ts` (`visibleSections` par rôle) |
| Aucune URL changée | **Remplacé par les critères de T-0120, T-0121 et T-0123** : les adresses ont changé à dessein, chaque ancienne adresse redirige (voir ces tâches) |

## T-0110 Mobile
| Critère | Preuve |
|---|---|
| À 390 px : aucune navigation sur plusieurs lignes, aucun défilement horizontal | e2e `navigation.spec.ts` (« téléphone (390 px) : sélecteur de section et barre basse ») ; `mobile-nav.test.tsx` |
| Cibles ≥ 44 px | même e2e (hauteurs de la barre basse et du sélecteur) |

## T-0111 Création contextuelle
| Critère | Preuve |
|---|---|
| Créer un ticket en ≤ 3 actions depuis n'importe quel écran | e2e `creation.spec.ts` (écran Tracker, Mon travail, touche N) ; `create-flow.test.tsx` |
| La liste et ses filtres restent en place | e2e `creation.spec.ts` ; `create-flow.test.tsx` (« on reste dans la liste ») |

## T-0112 Fiche
| Critère | Preuve |
|---|---|
| Bouton Précédent : l'onglet est restauré | e2e `fiche.spec.ts` (onglet dans l'adresse) ; `item-sheet.test.tsx` |
| Informations clés visibles sans clic | e2e `fiche.spec.ts` (en-tête complet, blocage) ; `item-sheet.test.tsx` |

## T-0113 Relations
| Critère | Preuve |
|---|---|
| Saut entre tickets liés en 1 action, puis retour en 1 action | `relations.test.tsx` ; e2e `fiche.spec.ts` (précédent, suivant, retour à la liste filtrée), `liens.spec.ts` |

## T-0114 Board
| Critère | Preuve |
|---|---|
| Board › ticket › retour en 1 action, filtres conservés | e2e `board.spec.ts` (carte › panneau › retour) ; `board.test.tsx` |
| « Déplacer vers » au clavier conservé | `board.test.tsx` |
| Index `/p/:p/board` : le board de chaque tracker en 1 clic | e2e `board.spec.ts` (« index des boards ») |

## T-0115 Backlog, côté API
| Critère | Preuve |
|---|---|
| Ordre stable, droits, RLS | `apps/api/src/agile/backlog.test.ts` ; migration `048_backlog_rank.sql` |
| Données de démonstration (projets, trackers Tâche, sprints) | `tools/dev-start.mjs` ; e2e `backlog.spec.ts` s'appuie dessus |

## T-0116 Page Backlog
| Critère | Preuve |
|---|---|
| Un sprint se planifie sans quitter la page, au clavier compris | e2e `backlog.spec.ts` (réordonner, ajouter au sprint, démarrer, burndown, clore) ; `backlog-page.test.tsx` |

## T-0117 Roadmap
| Critère | Preuve |
|---|---|
| Avancement d'une version en 1 clic depuis le rail | e2e `roadmap.spec.ts` ; `roadmap-page.test.tsx` |

## T-0118 API de recherche globale
| Critère | Preuve |
|---|---|
| Un ticket d'un projet non autorisé n'apparaît jamais | `core/access.test.ts` (recherche d'organisation sous listes d'ayants droit) ; `atql/saved-search.test.ts` (recherches personnelles, isolation par organisation) |

## T-0119 Recherche globale et palette
| Critère | Preuve |
|---|---|
| Trouver un ticket par clé depuis n'importe où en ≤ 2 actions | e2e `recherche.spec.ts` ; `navigation.test.tsx` (« hors projet aussi : la palette cherche dans tous les projets (2 actions) ») ; `global-search-page.test.tsx` |

## T-0120 Paramètres et redirections
| Critère | Preuve |
|---|---|
| Toute ancienne URL mène à la nouvelle page | `web9.test.tsx` (`/manage`, `/planification`, `/membres`, `/admin`, `/trackers/:t/config`, `/dashboard`) ; e2e `audit.spec.ts`, `parcours.spec.ts` |
| Aucune page de projet ne règle un objet global | webhooks et plugins à l'Administration (`/admin`) ; `web9.test.tsx` (rôles par section) ; `navigation.test.ts` (`SETTINGS_SECTIONS`) |

## T-0121 Rapports
| Critère | Preuve |
|---|---|
| Toute ancienne URL mène à la nouvelle page | `web9.test.tsx` (« Rapports (T-0121) » : `/code` → Livraison) ; `navigation.test.ts` (`placeOf` des anciennes adresses) ; e2e `audit.spec.ts`, `gabarits.spec.ts`, `tracabilite.spec.ts` (ouvrent encore `/tracabilite`, `/conformite`) |
| Rail du projet ≤ 9 entrées | `navigation.test.ts` (« laissent au plus 9 entrées au rail d'un administrateur ») : Vue d'ensemble, Backlog, Board, Trackers, Roadmap, Rapports, Documents, Recherche, Paramètres |
| Un rapport dont le module est inactif est masqué | `navigation.test.ts` (`visibleReports`) ; `web9.test.tsx` (retour au premier rapport affiché) |

## T-0122 Tableau de bord configurable
| Critère | Preuve |
|---|---|
| Disposition par défaut sans réglage | `core/dashboard.test.ts` (six widgets, aucune ligne en base) ; `Dashboard.test.tsx` ; e2e `tableau-de-bord.spec.ts` |
| Masquer, réordonner, dupliquer, réinitialiser | `Dashboard.test.tsx` ; e2e `tableau-de-bord.spec.ts` (survit au rechargement) |
| Widget fondé sur une vue enregistrée | `Dashboard.test.tsx` (ajout depuis `/v1/searches`) |
| Disposition par utilisateur (migration, API) | migration `050_dashboard_layout.sql` ; `core/dashboard.test.ts` (personnelle, propre à l'organisation) |

## T-0123 Global
| Critère | Preuve |
|---|---|
| Rail global ≤ 6 entrées | `global-nav.test.tsx` (Favoris, Récents, Projets, Mon travail, Recherche, Administration) |
| Redirections testées | `global-nav.test.tsx` (`/me` → `/`, `/org` → `/admin`) ; e2e `audit.spec.ts` |
| `/` = Mon travail sur le moteur, `/projets`, `/profil`, `/notifications` | `global-nav.test.tsx` ; e2e `tableau-de-bord.spec.ts`, `audit.spec.ts` |
| Vue d'ensemble du projet sur le moteur | `core/dashboard.test.ts` (portée projet, migration `051_dashboard_scope.sql`) ; `web9.test.tsx` (« Vue d'ensemble ») |

## T-0124 Libellés
| Critère | Preuve |
|---|---|
| Le test échoue si « artefact », « release » ou « template » restent dans les textes français affichés | `vocabulaire.test.ts` (tout le dictionnaire français, fonctions comprises) ; messages d'erreur de l'API alignés |
| `docs/user` à jour | `GUIDE.md` et `FORMATION.md` (vocabulaire, navigation, tableau de bord, Profil) |

## Écarts du lot : décisions de l'utilisateur (2026-11-10)
1. **Widget « À approuver » : comblé.** `GET /v1/me/approvals` (`ItemApprovalService.awaiting`) liste les tickets dont l'étape courante désigne la personne ou son rôle, sous ses droits (listes d'ayants droit) ; preuve : `core/item-approval.test.ts` (« liste les tickets qui attendent ma décision ») et `Dashboard.test.tsx`. L'assurance qualité voit en plus les jalons et baselines en attente.
2. **Widget « Échéances de la semaine » : accepté.** Sa requête ATQL cible le champ `due` du gabarit standard (`due <= daysFromNow(7)`). Un tracker dont l'échéance porte une autre clé n'y figure pas ; on corrige la requête en dupliquant le widget. **À expliquer dans le manuel utilisateur** (mise à jour du manuel à la toute fin).
3. **Page d'accueil du Profil** : mémorisée par navigateur (comme la langue et le thème), pas sur le compte. **En attente de décision** : l'utilisateur a demandé la politique de JIRA et de Tuleap avant de choisir (réponse donnée en séance).
4. **Manuel utilisateur et captures** (ADR-0003 § 5) : **reporté à la toute fin du projet** (décision de l'utilisateur). Le texte de `docs/user` est à jour pour le lot ; le manuel Word et ses captures seront refaits en fin de projet (skill `doc:mu`).

## Limites connues, sans lien avec le lot
- Tests instables : `web15` (Matrice), `web16`, e2e `notifications.spec.ts` (la case « Commentaire » reste cochée au premier passage après réinitialisation de la base ; passe au rejeu).
- `history.test.ts` (API) : 2 échecs préexistants quand GitLab répond. `openbao.test.ts` : HTTP 403 dans cet environnement.
