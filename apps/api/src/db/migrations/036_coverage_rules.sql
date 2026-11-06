-- 036 : règles de couverture (ADR-0002, Lot 2). Une règle dit : « tout item du tracker `from_tracker_key` (dans les états
-- `status_filter`, tous si vide) a au moins `min_count` liens du type `link_type_key`, dans le sens `direction` ».
-- `project_id` nul = règle d'organisation, appliquée dans chaque projet qui a ce tracker ; une règle de projet de même clé la remplace.
-- `threshold` : {"target": 0-100, "warning": 0-100} en pourcentage, saisi par l'utilisateur (seuils ECSS compris).
create table coverage_rule (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid,
  key text not null check (key ~ '^[a-z][a-z0-9_-]{0,39}$'),
  name text not null check (length(name) between 1 and 200),
  from_tracker_key text not null check (from_tracker_key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  link_type_key text not null check (link_type_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  direction text not null default 'any' check (direction in ('in', 'out', 'any')),
  min_count integer not null default 1 check (min_count between 1 and 100),
  status_filter text[] not null default '{}',
  threshold jsonb not null default '{"target": 100}',
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id) on delete cascade
);
create unique index coverage_rule_org_key on coverage_rule (organization_id, key) where project_id is null;
create unique index coverage_rule_project_key on coverage_rule (project_id, key) where project_id is not null;
alter table coverage_rule enable row level security;
alter table coverage_rule force row level security;
create policy org_isolation on coverage_rule using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on coverage_rule to athena_app;

-- Le calcul de couverture compte les liens entrants : l'unicité (from, to, type) ne couvre que les sortants.
create index artifact_link_to_type on artifact_link (to_artifact_id, link_type_id);
create index artifact_link_type on artifact_link (link_type_id);
-- Les liens suspects sont rares : des index partiels rendent leur dénombrement indépendant du nombre de liens.
create index artifact_link_suspect_from on artifact_link (from_artifact_id) where suspect;
create index artifact_link_suspect_to on artifact_link (to_artifact_id) where suspect;
