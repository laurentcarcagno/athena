# Lot 5 : vérification critère par critère

Chaque critère d'acceptation des fiches T-0081 à T-0085, avec la preuve qui le couvre. Le lot compte cinq tâches (`STATE.md`, ADR-0002 et fiches `Lot : 5`) ; les cinq sont faites. Tous les tests cités sont dans `pnpm check`.

## T-0081 API de consultation
| Critère | Preuve |
|---|---|
| `GET .../docs` liste les documents ; `.../docs/:doc/tree` renvoie l'arborescence ; recherche par UID exact, préfixe et texte (index plein texte) | `doc-read.test.ts` : liste (titre, compteurs, lien vers la source), arborescence dans l'ordre de lecture, recherche UID exact puis préfixe puis texte (jokers LIKE neutralisés, filtre par document) |
| Énoncés assainis avant renvoi (même chaîne que les commentaires) | `doc-read.test.ts` (« assainit les énoncés avant renvoi (XSS) ») : balises, `<script>`, `<img onerror>`, `javascript:`, commentaires HTML, caractères de contrôle ; le client les affiche comme du texte (`web23.test.tsx`) |
| Aucun point d'écriture ajouté | `doc-read.test.ts` : le contrôleur ne déclare que des `GET`, hors l'acquittement d'un lien (qui ne modifie pas le document) |
| Ré-indexation incrémentale conservée | `doc-read.test.ts` : ré-indexation identique = 0 nœud écrit ; un nœud modifié = 1 écrit ; nœuds disparus supprimés |
| Parseur : ordre et profondeur | `doc-read.test.ts` : position, profondeur, section parente, UID synthétiques des sections sans UID, empreinte indépendante de la place |

## T-0082 Onglet Documents
| Critère | Preuve |
|---|---|
| Onglet masqué sans source documentaire indexée | `web23.test.tsx` (module `documents` absent : pas d'onglet) ; `web9.test.tsx` ; module calculé par `project-overview.service` (existant) |
| URL stable par exigence `/p/:p/documents/:doc#UID` | `web23.test.tsx` (ancre : nœud sélectionné, `aria-current`, défilement) ; e2e `documents.spec.ts` (adresse rouverte directement) |
| UID en mono, bannière « lecture seule : modifier dans StrictDoc » avec lien vers la source | `web23.test.tsx` (classe `ath-mono`, bannière, lien `rel="noopener noreferrer"`) |
| Chaque nœud rendu sans HTML brut non assaini | `web23.test.tsx` : un énoncé contenant `<b>` et `<img onerror>` s'affiche littéralement, aucun élément injecté, aucun attribut `style` ; e2e : aucune balise `script` |
| Tests : RTL, axe, Playwright (ouvrir un document, chercher une UID) | `web23.test.tsx` (axe, citations ouvertes), `e2e/tests/documents.spec.ts` |

## T-0083 Artefacts citants
| Critère | Preuve |
|---|---|
| `GET .../docs/nodes/:uid/citations` renvoie artefacts, état, lien suspect | `doc-read.test.ts` (clé, tracker, titre, état, catégorie, `suspect`, origine) |
| Visible dans la liste et dans le panneau de l'exigence | `web23.test.tsx` : nombre dans le plan et sur le nœud, détail dans le panneau |
| Respecte les droits et les listes d'ayants droit | `doc-read.test.ts` : liste de tracker (citations et compteur à 0 pour un non-membre), liste de projet (documents et recherche refusés) |

## T-0084 Citer une exigence
| Critère | Preuve |
|---|---|
| Citation possible sur tout tracker (une action de sprint cite une exigence de l'URD) | `web24.test.tsx` (sélecteur à autocomplétion par UID ou titre) ; e2e `sprint-doc.spec.ts` (tracker `action`, item dans un sprint) |
| Modification de l'exigence puis ré-indexation : le lien devient suspect et le webhook `link.suspect` part | `doc-read.test.ts` : événement `link.suspect` par lien, **livraison webhook** pour chacun ; e2e : pastille « Suspect » dans la fiche et dans le document |
| Acquittement par un humain, avec audit | `doc-read.test.ts` (audit `doc.acknowledge` au nom de l'utilisateur), `web24.test.tsx` (route d'acquittement), e2e (la pastille disparaît) |
| **Critère de sortie du Lot 5** : une action de sprint cite une exigence de l'URD et signale sa modification | `e2e/tests/sprint-doc.spec.ts` |

## T-0085 Baselines couplées aux documents
| Critère | Preuve |
|---|---|
| Une baseline enregistre le SHA de chaque source documentaire | `baseline-docs.test.ts` (`doc_shas`, empreintes figées par exigence) |
| La comparaison liste les exigences ajoutées, modifiées, supprimées | `baseline-docs.test.ts` (dans les deux sens, changement de SHA), `web25.test.tsx` |
| Exportable (marquage de protection si défini) | `baseline-docs.test.ts` (CSV, formules neutralisées, mention en tête et en pied) ; `web25.test.tsx` (export) |
| Bloquer l'écart silencieux | `baseline-docs.test.ts` : baseline refusée (409 détaillé) si le dépôt documentaire a avancé ou est introuvable, sans ligne ni étiquette créée |
