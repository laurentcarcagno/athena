-- 058 : modèle de planification (Lot 12, T-0159, ADR-0006).
-- Rôles sémantiques `start_date`, `progress`, `remaining` ; type de lien « ordonné » (fin → début) avec décalage en jours ouvrés.

alter table field_definition drop constraint if exists field_definition_semantic_role_check;
alter table field_definition add constraint field_definition_semantic_role_check
  check (semantic_role in ('title','description','status','assignee','due_date','estimate','priority','version','start_date','progress','remaining'));

-- Un type « ordonné » est une dépendance de planification : l'extrémité sortante précède l'extrémité entrante, sans cycle.
alter table link_type add column ordered boolean not null default false;
-- Décalage entre la fin du prédécesseur et le début du successeur, en jours ouvrés (négatif : chevauchement).
alter table artifact_link add column lag_days integer not null default 0 check (lag_days between -365 and 365);
