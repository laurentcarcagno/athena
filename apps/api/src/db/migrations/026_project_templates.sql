-- 026 : templates de projet. Un template décrit plusieurs trackers (champs, statuts, transitions) créés avec le projet.
create table project_template (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z][a-z0-9-]{1,39}$'),
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '',
  trackers jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);
alter table project_template enable row level security;
alter table project_template force row level security;
create policy org_isolation on project_template using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, delete on project_template to athena_app;
