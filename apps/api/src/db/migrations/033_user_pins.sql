-- 033 : favoris et éléments récents de l'utilisateur (rail latéral). Une ligne par élément épinglé ou récemment ouvert.
create table user_pin (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  subject text not null,
  kind text not null check (kind in ('project', 'tracker', 'view', 'item')),
  project_key text not null check (project_key ~ '^[A-Z][A-Z0-9]{1,9}$'),
  ref text not null check (char_length(ref) between 1 and 120),
  label text not null check (char_length(label) between 1 and 160),
  favorite boolean not null default false,
  position integer not null default 0,
  last_opened_at timestamptz not null default now(),
  unique (organization_id, subject, kind, project_key, ref)
);
create index user_pin_subject on user_pin (organization_id, subject, favorite, position);
alter table user_pin enable row level security;
alter table user_pin force row level security;
create policy org_isolation on user_pin using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on user_pin to athena_app;
