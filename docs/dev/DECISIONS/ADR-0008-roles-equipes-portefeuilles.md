# ADR-0008 : rôles manager et directeur, membre d'équipe, équipes et portefeuilles (Lot 16)

Statut : accepté (2026-11-14), décisions prises sans question à la demande de l'utilisateur. Plan : `docs/dev/tasks/LOT16-PLAN.md`. Vérification : `docs/dev/tasks/LOT16-VERIFICATION.md`.

## 1. Contexte

Il faut deux rôles de plus : un **manager**, qui voit la charge de ses équipes, et un **directeur**, qui accède aux tableaux de bord ; le rôle `athena-user` devient **`athena-team-member`** (membre d'équipe) ; la notion de **portefeuille** de projets s'ajoute (consolidation de la santé, de l'avancement et des retards, comme dans les outils de gestion de portefeuille).

## 2. Décisions

1. **Rôles Keycloak** : `athena-admin`, `athena-pm`, `athena-qa`, `athena-team-member` (ex `athena-user`), `athena-manager`, `athena-director`. L'ancien nom est accepté et converti dans `withUserRole` (`apps/api/src/auth/auth.guard.ts`) pour ne casser aucun jeton existant.
2. **Rôle effectif** : l'assurance qualité et le manager ont aussi les droits d'un membre d'équipe ; le directeur les a **en lecture seule** (GET, HEAD) : il consulte tout, ne modifie rien (écrire reste interdit par `@Roles`).
3. **Visibilité** : tous les comptes d'une organisation voient déjà tous les projets (sous réserve des listes d'ayants droit) ; le directeur n'a donc besoin d'aucun droit d'accès nouveau, seulement de pages de synthèse.
4. **Équipe** (`team`, `team_member`, migration 063) : groupe de comptes connus avec un rôle `manager` ou `member` dans l'équipe. Un manager lit la charge des seules équipes qu'il dirige ; l'administrateur, le chef de projet et le directeur lisent toutes les équipes ; seul l'administrateur crée, modifie, supprime et compose les équipes. Les groupes Keycloak (lot 15 esquissé dans l'ADR-0006) pourront alimenter les équipes plus tard.
5. **Charge** : par personne, tickets ouverts (statut hors « terminé ») qui lui sont assignés, dont ceux dont l'échéance est passée, somme du champ de rôle `remaining`, répartition par projet. Un niveau « élevée » apparaît à partir de 3 tickets et de 1,5 fois la moyenne de l'équipe.
6. **Portefeuille** (`portfolio`, `portfolio_project`, migration 063) : clé, nom, description, responsable ; projets rattachés, avec une **santé forcée** facultative (sain, à surveiller, critique) et une note. La santé calculée est celle des indicateurs de pilotage (`healthOf` : bloqués, part de tickets en retard). La synthèse (`GET /v1/portfolios/:clé`, `/v1/portfolios/summary`) classe les projets du plus à risque au moins à risque et totalise avancement, retards et bloqués. Lecture : administrateur, chef de projet, directeur. Création et suppression : administrateur. Rattachement, santé forcée, note : administrateur et chef de projet.
7. **Tableaux de bord** : le directeur a tout le catalogue de cartes de pilotage et la disposition d'accueil d'un responsable ; le manager garde celui d'un membre d'équipe. Deux pages au rail global : **Charge des équipes** (`/charge`, administrateur, chef de projet, manager, directeur) et **Portefeuilles** (`/portefeuilles`, administrateur, chef de projet, directeur).
8. **Rôle affiché** sous le nom : le plus étendu des rôles portés (`apps/web/src/lib/roles.ts`).

## 2 bis. Rôle PMO (2026-11-15, étude PPM)

Rôle `athena-pmo` ajouté à la demande de l'utilisateur. Il a les droits d'un membre d'équipe, et en plus :
- il gère les portefeuilles (création, modification, suppression, rattachement, santé forcée, note) ;
- il gère les équipes (composition) et lit la charge de toutes ;
- il voit le catalogue complet des cartes de pilotage.

Il ne devient pas administrateur de l'instance. Le rôle affiché sous son nom est « PMO », avec l'icône de pilotage du directeur.

## 3. Hors périmètre (à décider plus tard)

Cartes de tableau de bord dédiées « santé de portefeuille » et « charge d'équipe » (les pages en tiennent lieu), budgets et coûts par portefeuille (lot 15), absences et capacité (lot 14 de l'ADR-0006), alimentation des équipes par les groupes Keycloak.
