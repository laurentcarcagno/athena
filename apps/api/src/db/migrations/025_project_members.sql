-- 025 : acteurs d'un projet (chef de projet, membre). Le sujet désigne un compte connu (table user_account).
create table project_member (
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  subject text not null,
  role text not null check (role in ('manager', 'member')),
  added_by text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, subject)
);
alter table project_member enable row level security;
alter table project_member force row level security;
create policy org_isolation on project_member using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on project_member to athena_app;
