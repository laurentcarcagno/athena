-- 031 : types de tracker d'organisation (ADR-0002, décision du 2026-11-06).
-- Les types livrés sont des données de l'application (comme les templates) ; cette table porte les types de
-- l'organisation et les modifications de types livrés (même clé). `tracker.type_key` désigne l'un ou l'autre.
create table tracker_type (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z][a-z0-9-]{1,39}$'),
  name text not null check (char_length(name) between 1 and 200),
  description text not null default '',
  category text not null check (category in ('engineering', 'development', 'verification', 'management')),
  default_views jsonb not null default '["tableau"]'::jsonb,
  base_fields jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  unique (organization_id, key)
);
alter table tracker_type enable row level security;
alter table tracker_type force row level security;
create policy org_isolation on tracker_type using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on tracker_type to athena_app;

alter table tracker add column type_key text check (type_key is null or type_key ~ '^[a-z][a-z0-9-]{1,39}$');
