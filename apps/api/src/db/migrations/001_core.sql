-- 001 : noyau (organisations, projets, trackers configurables, champs, workflow, types de lien).
-- Isolation : chaque table porte organization_id ; RLS forcée via app.org_id (plan § 13.3).
create extension if not exists pgcrypto;

-- Rôle de groupe sans connexion. Les identifiants de connexion sont fournis par OpenBao
-- (moteur database : GRANT athena_app TO "{{name}}").
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'athena_app') then
    create role athena_app nologin nosuperuser nobypassrls;
  end if;
end $$;

create function current_org() returns uuid language sql stable as
  $$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

create table organization (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  name text not null,
  created_at timestamptz not null default now()
);

create table project (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  name text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, key),
  unique (id, organization_id)
);

-- Plusieurs trackers par projet, clé unique dans le projet (plan § 15).
create table tracker (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  key text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  name text not null,
  description text not null default '',
  schema_version integer not null default 1 check (schema_version >= 1),
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (project_id, key),
  unique (id, organization_id)
);

create table tracker_sequence (
  tracker_id uuid primary key references tracker(id) on delete cascade,
  organization_id uuid not null,
  last_number bigint not null default 0
);

create table field_definition (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tracker_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null,
  type text not null,
  config jsonb not null default '{}'::jsonb,
  required boolean not null default false,
  position integer not null default 0,
  semantic_role text check (semantic_role in ('title','description','status','assignee','due_date','estimate')),
  foreign key (tracker_id, organization_id) references tracker(id, organization_id) on delete cascade,
  unique (tracker_id, key)
);
-- Un rôle sémantique n'est porté que par un champ par tracker.
create unique index field_semantic_unique on field_definition (tracker_id, semantic_role) where semantic_role is not null;

create table status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tracker_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  name text not null,
  category text not null check (category in ('todo','in_progress','done')),
  position integer not null default 0,
  foreign key (tracker_id, organization_id) references tracker(id, organization_id) on delete cascade,
  unique (tracker_id, key),
  unique (id, tracker_id)
);

create table transition (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  tracker_id uuid not null,
  name text not null,
  from_status_id uuid,
  to_status_id uuid not null,
  conditions jsonb not null default '[]'::jsonb,
  validators jsonb not null default '[]'::jsonb,
  post_actions jsonb not null default '[]'::jsonb,
  foreign key (tracker_id, organization_id) references tracker(id, organization_id) on delete cascade,
  foreign key (from_status_id, tracker_id) references status(id, tracker_id),
  foreign key (to_status_id, tracker_id) references status(id, tracker_id)
);

create table link_type (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  outward_label text not null,
  inward_label text not null,
  hierarchical boolean not null default false,
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (project_id, key),
  unique (id, organization_id)
);
