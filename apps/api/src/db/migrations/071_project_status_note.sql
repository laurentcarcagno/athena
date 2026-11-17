-- 071 : météo du projet (Lot 18, étude PPM § 2.4) : auto-évaluation périodique du chef de projet, distincte de la santé calculée.
-- Une ligne par écriture, en ajout seul ; la dernière fait foi. `cost` et `resources` restent nuls tant que les données V2 n'existent pas.
create table project_status_note (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  written_at timestamptz not null default clock_timestamp(),
  author text not null,
  schedule text not null check (schedule in ('ok', 'attention', 'critical')),
  scope text not null check (scope in ('ok', 'attention', 'critical')),
  risk text not null check (risk in ('ok', 'attention', 'critical')),
  resources text check (resources is null or resources in ('ok', 'attention', 'critical')),
  cost text check (cost is null or cost in ('ok', 'attention', 'critical')),
  comment text not null default '' check (char_length(comment) <= 2000)
);
create index project_status_note_project on project_status_note (project_id, written_at desc);
alter table project_status_note enable row level security;
alter table project_status_note force row level security;
create policy org_isolation on project_status_note using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on project_status_note as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert on project_status_note to athena_app;
