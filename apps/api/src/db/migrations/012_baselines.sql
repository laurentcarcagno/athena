-- 012 : baselines (tags Git de l'historique, couplées aux SHA de la documentation).
create table baseline (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null check (name ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$'),
  git_tag text not null,
  git_sha text not null,
  doc_shas jsonb not null default '{}'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (project_id, name)
);
alter table baseline enable row level security;
alter table baseline force row level security;
create policy org_isolation on baseline using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, delete on baseline to athena_app;
