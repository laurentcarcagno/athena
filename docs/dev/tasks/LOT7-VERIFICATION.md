# Lot 7 : vérification critère par critère

Chaque critère d'acceptation des fiches T-0091 à T-0096, avec la preuve qui le couvre. Le lot compte six tâches ; les six sont faites. Tous les tests cités sont dans `pnpm check` (17 sur 17, e2e 31 sur 31 à la fin du lot). Journaux par tâche : `T-0091` à `T-0096/CONTEXT.md`. Migrations réelles : **044** (notifications), **045** (résumé), **046** (circuits d'approbation) ; les numéros des fiches (040, 041, « aucune ») étaient indicatifs et ont été corrigés.

## T-0091 Notifications et abonnements
| Critère | Preuve |
|---|---|
| Événements : transition, mention, lien suspect, commentaire | `notify.test.ts` : transition (statuts de départ et d'arrivée, auteur exclu), commentaire (le commentateur suit ensuite), lien suspect (abonnés de l'item source, cause nommée), mention directe ; `mention.test.ts` |
| Abonnement par item, tracker ou vue enregistrée, réglage par événement | `notify.test.ts` : item, tracker, vue (la requête enregistrée est évaluée sur l'item), réglages par événement, idempotence ; `NotificationCenter.test.tsx` (suivre, ne plus suivre, réglages) |
| Les notifications respectent droits et ayants droit | `notify.test.ts` : liste d'ayants droit du tracker (rien n'est généré, abonnement refusé), retrait d'un droit (les notifications déjà reçues disparaissent de la lecture), contrôle export ; politique restrictive de lecture sur la table ; aucune valeur de champ dans la charge utile |
| Centre dans la barre supérieure, lu / non lu, accessible au clavier | `NotificationCenter.test.tsx` (ouverture à Entrée, Échap, focus rendu, lu, non lu, tout lu, compteur annoncé, axe) ; e2e `notifications.spec.ts` (clavier, axe avec contraste, lecture) |
| Migration : `subscription`, `notification`, `notification_pref`, RLS forcée, `org_isolation` | `notify.test.ts` (« chaque table est isolée par organisation ») ; migration `044_notifications.sql` |

## T-0092 Résumé quotidien par courriel
| Critère | Preuve |
|---|---|
| Planifié via les déclencheurs planifiés existants, heure par utilisateur | Boucle `résumé` du worker (`workers.test.ts`) ; `digest.test.ts` : heure locale par personne et fuseau (hiver et été), un courriel par jour, langue par personne, échec puis réessai |
| Aucun contenu hors droits ; liens canoniques | `digest.test.ts` : lecture sous les droits de la personne (contrôle export), liens `/p/<projet>/a/<clé>`, aucune valeur de champ |
| SMTP interne configurable, désactivable (réseau isolé) | `smtp.test.ts` (clair, AUTH, STARTTLS, TLS implicite, certificat inconnu refusé, injection d'en-têtes) ; `mailerFrom` nul sans configuration ; chart rendu avec `helm template` dans trois configurations (défaut, activé, isolé) |
| Test de non-sortie (T-0077) | `smtp.test.ts` : un relais hors du réseau interne est refusé par le garde avant toute résolution de nom ; sans configuration aucun client n'existe |

## T-0093 Mentions
| Critère | Preuve |
|---|---|
| Mention restreinte aux utilisateurs ayant accès à l'item | `mention.test.ts` : une personne sans accès est ignorée sans indication ; autocomplétion limitée aux personnes qui peuvent lire l'item (et sans soi-même) |
| Notification et entrée dans « Mon travail » | `mention.test.ts` (la mention remplace la notification de commentaire) ; `MentionInput.test.tsx` (section Mentions, lecture au clic, axe) ; e2e `notifications.spec.ts` |
| Rendu assaini | `MentionInput.test.tsx` (aucun HTML interprété, seules les mentions sont habillées) ; e2e (`<i>` laissé en texte) |

## T-0094 Circuits d'approbation
| Critère | Preuve |
|---|---|
| Circuit défini sur le tracker ; approbation journalisée dans l'audit chaîné | `item-approval.test.ts` : circuit et étapes ordonnées, décisions nominatives horodatées, entrées `approval.*` chaînées par hachage ; `ApprovalFlowEditor` (`ApprovalPanel.test.tsx`) |
| Réutilise l'approbation du rôle AQ étatique (T-0079) | `item-approval.test.ts` : une étape ouverte au rôle `athena-qa` ; même table `approval` ; non-régression des jalons et baselines |
| Modification après approbation : approbation invalidée avec message | `item-approval.test.ts` : invalidation sur changement de contenu (pas sur priorité ni statut), lignes conservées ; `ApprovalPanel.test.tsx` et e2e `approbation.spec.ts` : message affiché |
| Tests : circuits, invalidation, RTL, axe | `item-approval.test.ts` (12), `ApprovalPanel.test.tsx` (6, axe), e2e `approbation.spec.ts` |

## T-0095 Thème sombre
| Critère | Preuve |
|---|---|
| Tokens sombres déclarés, contrastes AA calculés, `design:check` vert | `DESIGN.json` (53 tokens sombres en stable, D-018, 64 paires dont les sombres) ; `validate-design --strict` (script du projet et du skill) : OK ; ratios recalculés (de 5,0 à 16,2 sur les paires principales) |
| Bascule clair, sombre, système, mémorisée | `theme.test.tsx` (ordre, mémoire, valeur illisible, stockage inaccessible, clavier) ; e2e `theme.spec.ts` (système clair et sombre mesurés, choix prioritaire, rechargement) |
| Aucune ombre ni dégradé ; axe sur les deux thèmes | `lint-design` et `components.test.tsx` (feuille de style) ; e2e `theme.spec.ts` et `audit.spec.ts` (axe avec contraste, deux thèmes) ; `tokens.test.ts` (aucune couleur sombre en dur) |
| Lint design, axe (deux thèmes), capture visuelle | `theme.spec.ts` : capture jointe au rapport pour chaque thème ; contrôle visuel fait à la main sur le tableau et la fiche |

## T-0096 Constats restants de l'audit d'interface
| Critère | Preuve |
|---|---|
| Chaque constat est marqué corrigé (avec preuve) ou ouvert (avec raison) | `design-audit-work/AUDIT_athena.md` § 6.1 : F-01 à F-13 et le nouveau F-14, une preuve rejouable chacun ; F-11 ouvert avec sa raison |
| Nouvelle mesure axe sur toutes les pages | e2e `audit.spec.ts` : 23 adresses et 5 onglets de fiche, administrateur (clair et sombre) et utilisateur, contraste compris : 0 violation (le contraste du texte d'état, F-14, a été corrigé à cette occasion) |
| Décision produit consignée pour F-11 (`Ctrl+K`) | `AUDIT_athena.md` § 6.2 : indication retirée maintenue (décision du 2026-11-01), découvrabilité par la page Aide et le guide, écart à `DESIGN.md` § 3.5 assumé, retour possible en taille S |
| Tests : Playwright + axe, mesures rejouées | `audit.spec.ts` ; `audit-followup.test.tsx` (double envoi, Administration réservée, valeurs ATQL) ; `tokens.test.ts` (tailles, cibles, couleurs de signal) |

## Limites déclarées
- **F-08** : comblé après le compte rendu : tout bouton qui déclenche une écriture passe en état « loading » (`Btn` + `writeActivity`), en plus du dédoublonnage de `api()`.
- **F-11** : écart assumé à la charte (voir ci-dessus).
- Résumé quotidien : la fiche prévoyait « aucune migration » ; l'heure par personne et le suivi des envois en exigent une (045).
- Circuits d'approbation : le validateur de transition `approval` s'ajoute par l'API (pas d'éditeur graphique de validateur). Les baselines et jalons gardent l'approbation de T-0080, réutilisée telle quelle.
- Non écouté : lecteur d'écran (NVDA, VoiceOver). Non testé contre un vrai serveur de messagerie : seul un serveur SMTP simulé (clair, TLS, STARTTLS) a été utilisé.
