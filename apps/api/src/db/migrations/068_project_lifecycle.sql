-- 068 : cycle de vie configurable du projet (Lot 17, étude PPM § 2.1 bis). Les états livrés sont dans le code (`ppm/lifecycle.ts`) ;
-- une organisation qui les personnalise enregistre ici la liste complète (états et transitions). Le code ne lit que la catégorie.
alter table project add column lifecycle_state text not null default 'in_progress';

create table project_lifecycle_state (
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (char_length(name) between 1 and 60),
  category text not null check (category in ('pipeline', 'active', 'suspended', 'closed', 'cancelled', 'archived')),
  position integer not null,
  hidden boolean not null default false,
  primary key (organization_id, key)
);
create table project_lifecycle_transition (
  organization_id uuid not null references organization(id),
  from_key text not null,
  to_key text not null,
  -- parmi manager (chef du projet), pmo ; l'administrateur peut toujours
  roles text[] not null check (roles <@ array['manager', 'pmo']),
  primary key (organization_id, from_key, to_key),
  foreign key (organization_id, from_key) references project_lifecycle_state(organization_id, key) on delete cascade,
  foreign key (organization_id, to_key) references project_lifecycle_state(organization_id, key) on delete cascade
);
-- Historique : ajout seul (aucun droit de modification ni de suppression).
create table project_lifecycle_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  from_key text,
  to_key text not null,
  reason text not null default '' check (char_length(reason) <= 500),
  changed_by text not null,
  changed_at timestamptz not null default now()
);
create index project_lifecycle_history_project on project_lifecycle_history (project_id, changed_at);

alter table project_lifecycle_state enable row level security;
alter table project_lifecycle_state force row level security;
create policy org_isolation on project_lifecycle_state using (organization_id = current_org()) with check (organization_id = current_org());
alter table project_lifecycle_transition enable row level security;
alter table project_lifecycle_transition force row level security;
create policy org_isolation on project_lifecycle_transition using (organization_id = current_org()) with check (organization_id = current_org());
alter table project_lifecycle_history enable row level security;
alter table project_lifecycle_history force row level security;
create policy org_isolation on project_lifecycle_history using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on project_lifecycle_history as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert, update, delete on project_lifecycle_state to athena_app;
grant select, insert, update, delete on project_lifecycle_transition to athena_app;
grant select, insert on project_lifecycle_history to athena_app;
