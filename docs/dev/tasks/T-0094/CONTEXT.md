# Journal de la tâche T-0094

## Fait
- Migration **046** (la fiche disait 041, déjà prise) : `approval_flow` (un par tracker), `approval_step` (position, nature relecture ou approbation, personnes désignées, rôle `athena-qa`, nombre de décisions requises), RLS forcée + `org_isolation` + politique d'ayants droit ; la table `approval` de T-0080 est **étendue** (`object_type = 'item'`, `step_id`, `object_version`, `invalidated_at`, `invalidated_version`). L'ancienne contrainte d'unicité devient un index partiel (jalons et baselines) et `ApprovalService.decide` cible cet index.
- `core/item-approval.service.ts` : `circuitState` (pur : première étape non terminée, un refus l'emporte), `ItemApprovalService` (circuit, lecture pour l'appelant avec `canDecide`, décision nominative à l'étape courante), `invalidateItemApprovals` (appelée par `ArtifactService.update` quand le **contenu** change : lignes conservées et marquées, audit chaîné `approval.invalidated`, notification), `approvalSatisfied` (validateur de transition `approval`).
- Réutilisation de l'approbation du rôle AQ étatique : une étape peut désigner `athena-qa` ; la même table et la même décision nominative que pour les jalons et baselines.
- Audit chaîné : `approval.flow_set`, `approval.item.approved|rejected`, `approval.invalidated` (trigger de hachage de `audit_log`).
- Notifications (événement `approval` de T-0091) : abonnés avertis de chaque décision, approbateurs nommés avertis de l'ouverture de leur étape, approbateurs et abonnés avertis d'une invalidation.
- Interface : `ApprovalPanel` (onglet Approbation de la fiche : état en texte, étapes, désignés, décisions, message d'invalidation, décision confirmée), `ApprovalFlowEditor` (carte de la configuration du tracker), textes FR/EN, `NotificationCenter` et résumé quotidien décrivent les événements d'approbation.
- Tests : `item-approval.test.ts` (12 : état du circuit, parcours des étapes, refus, invalidation contenu / hors contenu / statut, plusieurs décisions, validateur de transition, circuit modifié, validation, notifications, ayants droit, non-régression jalons et baselines), `ApprovalPanel.test.tsx` (6 dont axe), e2e `approbation.spec.ts` (circuit défini par l'API, décision confirmée au clavier-souris, invalidation, axe dans le navigateur).

## Décisions
- Invalidation = **modification de contenu** (champs `isContent`, comme la suspicion des liens), pas tout changement de version : une transition de statut ou un changement de priorité ne rouvre pas le circuit.
- Remplacer le circuit d'un tracker invalide les décisions en cours sur ses items (un circuit différent ne peut pas hériter de décisions prises pour l'ancien) ; l'interface le dit avant l'enregistrement.
- L'exigence « circuit terminé avant une transition » est un validateur de transition (`approval`), à ajouter à la transition voulue : il ne s'impose pas à toutes les transitions.
- « Item ou baseline » : les items ont le circuit multi-étapes ; les baselines et jalons gardent l'approbation de T-0080 (assurance qualité étatique, décision nominative et horodatée, audit), réutilisée telle quelle.

## Limites déclarées
- Pas d'éditeur graphique du validateur `approval` dans l'éditeur de workflow : il s’ajoute par l’API.
- Pas d'interdiction pour l'auteur d'une modification d'approuver son propre travail (non demandée) ; le circuit peut désigner des personnes distinctes.

## Écarts
- Aucun.
