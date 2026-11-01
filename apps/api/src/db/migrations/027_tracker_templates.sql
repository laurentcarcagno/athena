-- 027 : templates de tracker réutilisables (un tracker complet : champs, statuts, transitions).
create table tracker_template (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z][a-z0-9-]{1,39}$'),
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '',
  tracker jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);
alter table tracker_template enable row level security;
alter table tracker_template force row level security;
create policy org_isolation on tracker_template using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, delete on tracker_template to athena_app;
