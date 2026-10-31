-- 008 : références vers le code (commits, branches, merge requests) liées aux artefacts (plan § 17).
create table code_ref (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  artifact_id uuid not null,
  kind text not null check (kind in ('commit', 'branch', 'mr')),
  ref text not null,
  title text not null default '',
  url text not null default '',
  state text not null default '',
  pipeline text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (artifact_id, organization_id) references artifact(id, organization_id) on delete cascade,
  unique (artifact_id, kind, ref)
);
alter table code_ref enable row level security;
alter table code_ref force row level security;
create policy org_isolation on code_ref
  using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on code_ref to athena_app;
