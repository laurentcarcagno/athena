-- 085 : objectifs strategiques et rattachement des projets (Lot 25, etude PPM § 2.8 et B41). Alimentent le diagramme de flux objectifs vers projets du portefeuille.
create table strategic_objective (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z][a-z0-9_-]{1,29}$'),
  name text not null check (char_length(name) between 1 and 200),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);
create table objective_project (
  objective_id uuid not null references strategic_objective(id) on delete cascade,
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  weight numeric(6, 2) not null default 1 check (weight > 0 and weight <= 1000),
  linked_by text not null,
  linked_at timestamptz not null default now(),
  primary key (objective_id, project_id)
);
alter table strategic_objective enable row level security;
alter table strategic_objective force row level security;
create policy org_isolation on strategic_objective using (organization_id = current_org()) with check (organization_id = current_org());
alter table objective_project enable row level security;
alter table objective_project force row level security;
create policy org_isolation on objective_project using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on objective_project as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert, update, delete on strategic_objective, objective_project to athena_app;
