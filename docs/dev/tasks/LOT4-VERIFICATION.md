# Lot 4 : vérification critère par critère

Chaque critère d'acceptation des fiches T-0076, T-0077, T-0078, T-0079, T-0099 et T-0080, avec la preuve qui le couvre. Le lot compte six tâches (`STATE.md` et ADR-0002) ; les six sont faites. Tous les tests cités sont dans `pnpm check`.

**Liste des tâches, recoupée le 2026-11-06** : `STATE.md` (« Lot 4, instance Défense ») et les fiches `docs/dev/tasks/*/TASK.md` annonçant `Lot : 4` donnent les mêmes six tâches (T-0076, T-0077, T-0078, T-0079, T-0099, T-0080), toutes faites et commitées.

**Canaux d'export de l'application, inventoriés** (recherche de `csv`, `yaml`, `markdown`, téléchargements du navigateur) : CSV de conformité, YAML de gabarit et notes de version (API, mention posée par le contrôleur) ; CSV de la matrice (navigateur, mention posée par `markCsv`) ; fichiers YAML de l'historique Git ; webhooks sortants ; en-tête `X-Athena-Protection-Level` sur toutes les réponses. Les pièces jointes sont des fichiers d'utilisateurs, la CLI n'exporte rien, Athena ne génère pas de PDF.

## T-0076 Réseau isolé
| Critère | Preuve |
|---|---|
| Aucune URL externe (code, feuilles de style, HTML, images), script de contrôle en CI | `tools/check-external-urls.mjs` ; `apps/api/src/testing/isolated.test.ts` (« le code livré ne contient aucune URL externe », détection sur fichier d'interface) ; `--dist` exécuté sur `apps/web/dist` : aucune URL |
| Archive transférable avec sommes de contrôle, procédure de chargement dans un registre interne | `tools/export-bundle.mjs`, `tools/bundle-lib.mjs`, `load-bundle.sh` ; `isolated.test.ts` (manifeste, altération détectée, script qui vérifie avant de charger, `--dry-run`) ; `INSTALLATION.md` §1 et §2 |
| Keycloak et OpenBao inclus, politiques réseau « tout refuser » | `templates/isolated.yaml`, `templates/networkpolicy.yaml`, `coredns-isolated.yaml` ; `isolated.test.ts` (chart) ; recette `kind` |
| Section « Réseau isolé » testée sur `kind` coupé de l'extérieur | `docs/dev/tasks/T-0076/CONTEXT.md` : chart complet déployé (PostgreSQL, 41 migrations, API, worker, web, Keycloak, OpenBao), parcours de bout en bout avec un jeton du Keycloak du cluster, sorties mesurées **depuis le vrai pod API** (publics bloqués, Keycloak et OpenBao joignables) et matrice de connectivité sur pods étiquetés comme les composants (contrôle des politiques seules) ; DNS isolé vérifié avant/après sur le vrai pod. Trois défauts du chart trouvés puis corrigés par cette recette |

## T-0077 Absence de requête sortante
| Critère | Preuve |
|---|---|
| Garde sur `http/https/net/dns` en test, liste limitée aux hôtes internes configurés | `no-egress.ts`, `no-egress-setup.ts` (actif dans les 470+ tests de l'API), `no-egress.test.ts` |
| e2e : le navigateur échoue si une requête sort de l'origine | `e2e/tests/no-egress.spec.ts` : après connexion, l'ensemble des origines des requêtes de dix pages est exactement `http://localhost:3000` ; toute requête sortante est consignée et fait échouer le test |
| Rouge sur un appel fictif vers un hôte public | `no-egress.test.ts` (`assertClean` lève après un appel fictif) ; premier test de `no-egress.spec.ts` (requête fictive consignée) |

## T-0078 Niveau de protection
| Critère | Preuve |
|---|---|
| Niveau vide : aucun bandeau ; renseigné : bandeau fixe en tête de chaque page, lu par les lecteurs d'écran | `web19.test.tsx` (vide, renseigné, rôle `note` étiqueté, premier élément de l'application, avant connexion aussi), `bff.test.ts` (session) |
| Exports (CSV, YAML, documents générés, API d'export) portent la mention en en-tête et pied |  `export-marking.test.ts` (CSV avec BOM, YAML, Markdown, JSON, en-tête HTTP, neutralisation des sauts de ligne) ; CSV de la matrice dans `web19.test.tsx`. Athena ne génère pas de PDF : les documents qu'elle génère sont les notes de version, les exports et les fichiers YAML de l'historique Git (`tracker.yaml`, fichiers d'items), qui portent la mention en tête et en pied (`history.test.ts`) |
| Le bandeau n'est pas rouge | `web19.test.tsx` (CSS sans rouge de cérémonie, ombre, dégradé ni arrondi) |
| Tests : API en-têtes, RTL bandeau, axe | `export-marking.test.ts`, `web19.test.tsx` (axe) |

## T-0079 Listes d'ayants droit
| Critère | Preuve |
|---|---|
| Projet ou tracker doté d'une liste lisible de ses seuls membres, administrateurs compris | `access.test.ts` (« un projet doté d'une liste… », « une liste de tracker… ») |
| Recherche, ATQL, palette, plein texte, tableaux de bord, compteurs : aucune fuite | `access.test.ts` : ATQL, compteurs de toutes les tables, plein texte, requête de palette, couverture, arbre, matrice, favoris, journal d'automatisation (migration 042) ; les tableaux de bord lisent `artifact` sous la même politique restrictive |
| Modifications auditées dans le journal chaîné | `access.test.ts` (« chaque modification de liste est consignée… ») |
| Tests : matrice rôle × liste, RTL, axe | `access.test.ts`, `access.interceptor.test.ts`, `web20.test.tsx` (axe) |

## T-0099 Contrôle export
| Critère | Preuve |
|---|---|
| Item marqué lisible des seuls ayants droit ; liens affichent « lien vers un item sous contrôle export » sans titre ni contenu | `export-control.test.ts` (lecture, recherche, plein texte, compteurs, couverture, liens), `web21.test.tsx` (libellé, axe) |
| Webhooks et exports excluent ou masquent selon les droits du destinataire | `export-control.test.ts` : abonnement habilité ou non (livraison réelle), **CSV de conformité** et **matrice** sans l'item pour un non-ayant droit (lecteur : ni clause ni clé ; ayant droit : présent), mention de l'instance sur le CSV ; canal Git ci-dessous |
| Historique GitLab (canal d'export) : l'item n'y est ni lisible ni exposé | `history.test.ts` (« item sous contrôle export… ») : valeurs chiffrées par OpenBao dans Git (titre et contenu absents en clair), retirées (`masked`) sans OpenBao, marquage inscrit dans le fichier, retour en clair au démarquage, **reconstruction depuis Git qui rétablit marquage et contenu** ; la correction de la synchronisation inverse applique la même règle. Les commits antérieurs au marquage restent dans l'historique Git (immuable) : annoncé dans la confirmation de marquage |
| Changement réservé aux responsables, audité | `export-control.test.ts` (route réservée, révision, événement, audit), `web21.test.tsx` |

## T-0080 Assurance qualité étatique
| Critère | Preuve |
|---|---|
| Lit ce que sa liste autorise, n'écrit rien | `auth.test.ts` (lecture 200, écritures 403, jamais administrateur), `approval.test.ts` (liste d'ayants droit) |
| Approuve un jalon ou une baseline : nominatif, horodaté, audité | `approval.test.ts` (décisions, remplacement, journal d'audit), `web22.test.tsx` |
| Une baseline requérant une approbation ne passe « approuvée » qu'avec elle | `approval.test.ts` (état « en attente » puis « approuvée » ; refus l'emporte ; publication d'un jalon bloquée) |
