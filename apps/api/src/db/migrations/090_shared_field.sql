-- 090 : bibliotheque de champs partages (plan § 15.3), au niveau de l'organisation ou d'un projet : un champ type (type, configuration, par exemple une liste de valeurs
-- commune) reutilisable lors de l'ajout d'un champ a un tracker. Le champ est COPIE dans le tracker : modifier la bibliotheque ne change pas les trackers existants.
create table shared_field (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid references project(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (char_length(label) between 1 and 100),
  type text not null,
  config jsonb not null default '{}'::jsonb,
  created_by text not null,
  updated_at timestamptz not null default now()
);
create unique index shared_field_org_key on shared_field (organization_id, key) where project_id is null;
create unique index shared_field_project_key on shared_field (project_id, key) where project_id is not null;
alter table shared_field enable row level security;
alter table shared_field force row level security;
create policy org_isolation on shared_field using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on shared_field to athena_app;
