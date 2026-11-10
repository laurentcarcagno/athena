-- 047 : rôles sémantiques « priorité » et « version » (Lot 9, T-0112).
-- L'en-tête de la fiche affiche la priorité et la version cible d'un ticket quel que soit le nom du champ qui les porte
-- (« Sévérité », « Priorité », « Version corrigée »…). Un rôle reste unique par tracker (index `field_semantic_unique`).

alter table field_definition drop constraint if exists field_definition_semantic_role_check;
alter table field_definition add constraint field_definition_semantic_role_check
  check (semantic_role in ('title','description','status','assignee','due_date','estimate','priority','version'));
