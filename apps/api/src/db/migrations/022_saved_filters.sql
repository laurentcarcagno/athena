-- 022 : filtres ATQL enregistrés (personnels ou partagés au sein du projet).
create table saved_filter (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  query text not null check (char_length(query) <= 2000),
  owner text not null,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, owner, name)
);
alter table saved_filter enable row level security;
alter table saved_filter force row level security;
create policy org_isolation on saved_filter using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, delete on saved_filter to athena_app;
