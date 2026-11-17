-- 070 : rôles sémantiques `probability` et `impact` (Lot 17, étude PPM § 2.7). Entiers de 1 à 5 portés par un champ numérique ;
-- la criticité (probabilité × impact) est calculée, jamais stockée. Un tracker sans ces rôles garde ses champs par leur nom.
alter table field_definition drop constraint if exists field_definition_semantic_role_check;
alter table field_definition add constraint field_definition_semantic_role_check
  check (semantic_role in ('title','description','status','assignee','due_date','estimate','priority','version','start_date','progress','remaining','probability','impact'));
