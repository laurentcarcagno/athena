-- 014 : dépôts de code GitLab associés à un projet (création de branche et de merge request depuis un ticket).
create table code_repo (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  gitlab_path text not null check (gitlab_path ~ '^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+){0,5}$'),
  default_branch text not null default 'main' check (default_branch ~ '^[A-Za-z0-9._/-]{1,100}$'),
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (project_id, gitlab_path)
);
alter table code_repo enable row level security;
alter table code_repo force row level security;
create policy org_isolation on code_repo using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, delete on code_repo to athena_app;
