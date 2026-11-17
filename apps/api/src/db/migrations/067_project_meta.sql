-- 067 : méta du projet (Lot 17, étude PPM § 2.1) : dates de référence macro, sponsor, description, granularité de la capacité.
-- Table distincte de `project` : sans ligne, tous les champs sont vides (rien à migrer). Le planning détaillé reste maître de ses
-- tickets ; l'écart entre `planned_end` et la fin calculée se signale sans jamais corriger l'une ou l'autre.
create table project_meta (
  organization_id uuid not null references organization(id),
  project_id uuid primary key references project(id) on delete cascade,
  planned_start date,
  planned_end date,
  sponsor_subject text check (sponsor_subject is null or char_length(sponsor_subject) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  -- nul : hérite du réglage de l'organisation
  capacity_granularity text check (capacity_granularity is null or capacity_granularity in ('week', 'month')),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  check (planned_start is null or planned_end is null or planned_end >= planned_start)
);
alter table project_meta enable row level security;
alter table project_meta force row level security;
create policy org_isolation on project_meta using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on project_meta as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert, update, delete on project_meta to athena_app;
