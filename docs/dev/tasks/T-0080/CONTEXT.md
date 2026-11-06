# Journal de la tâche T-0080

## Fait
- Migration **041** : `approval` (organisation, projet, objet jalon ou baseline, approbateur nominatif, décision, commentaire, horodatage ; RLS forcée plus politique de liste d'ayants droit ; une décision par approbateur et par objet), `release.requires_approval`, `baseline.requires_approval`.
- Rôle Keycloak `athena-qa` : `AuthGuard` le traite comme `athena-user` **en lecture seule** (GET/HEAD) ; aucune écriture ne l'accepte, et la décision d'approbation l'exige explicitement (ni un administrateur ni un chef de projet n'approuve à sa place). Les lectures qu'il fait restent filtrées par les listes d'ayants droit (Db et RLS).
- `ApprovalService` : état `not_required` / `pending` / `approved` / `rejected` (un refus l'emporte, une approbation suffit sinon), exigence par les responsables, décision nominative horodatée et auditée, nouvelle décision du même approbateur remplaçante. Un jalon qui requiert une approbation ne se publie pas sans elle (`ReportService.publish`) ; une baseline qui en requiert une reste « en attente » tant qu'aucune décision favorable n'existe.
- Routes `GET /v1/projects/:p/approvals`, `PUT .../approvals/:type/:ref/required` (administrateurs et chefs de projet), `POST .../approvals/:type/:ref/decision` (`athena-qa` seul).
- Interface : `ApprovalsPanel` (état en texte, décisions nominatives, confirmation de la décision), onglet « Approbations » de la Planification pour les responsables, page Planification réduite aux approbations pour l'assurance qualité. Compte de développement `qa.dev` / `dev-only-qa` (royaume et `tools/dev-start.mjs`).
- Tests : `approval.test.ts` (8), garde HTTP du rôle dans `auth.test.ts`, `web22.test.tsx` (5 dont axe).
- Documentation : guide utilisateur (instance Défense) et section d'installation (rôles).

## Décisions
- Jalon = release du projet (états planifié, publié). T-0094 (Lot 7) étendra la table en circuits d'approbation.
- Un jalon déjà publié ne peut plus être refusé.

## Écarts
- Aucun.
