-- 018 : suivi de livraison (fusion, déploiement) et rétroportages par branche de maintenance.
alter table code_ref add column merge_sha text;
alter table code_ref add column merged_at timestamptz;
alter table code_ref add column target_branch text;
alter table code_ref add column deployed_at timestamptz;
alter table code_ref add column environment text;
create index code_ref_merge_sha on code_ref (merge_sha) where merge_sha is not null;

create table backport (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  artifact_id uuid not null,
  branch text not null check (branch ~ '^release/[0-9A-Za-z._-]{1,60}$'),
  state text not null default 'pending' check (state in ('pending', 'done')),
  mr_ref text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  foreign key (artifact_id, organization_id) references artifact(id, organization_id) on delete cascade,
  unique (artifact_id, branch)
);
alter table backport enable row level security;
alter table backport force row level security;
create policy org_isolation on backport using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on backport to athena_app;
