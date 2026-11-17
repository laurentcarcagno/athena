-- 077 : capacité (Lot 21, étude PPM § 2.9) : disponibilité d'une personne (temps partiel, journée propre), absences, allocations (nominatives ou
-- génériques par rôle). Unité : la minute. Capacité et charge se calculent à la lecture (`ppm/capacity.ts`).
create table person_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  subject text not null check (char_length(subject) between 1 and 200),
  from_day date not null,
  to_day date,
  ratio numeric(4, 3) not null check (ratio > 0 and ratio <= 1),
  workday_minutes integer check (workday_minutes is null or workday_minutes between 1 and 1440),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (to_day is null or to_day >= from_day)
);
create index person_availability_subject on person_availability (organization_id, subject, from_day);

create table absence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  subject text not null check (char_length(subject) between 1 and 200),
  from_day date not null,
  to_day date not null,
  kind text not null check (kind in ('leave', 'training', 'other')),
  half_day boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  check (to_day >= from_day),
  check (not half_day or from_day = to_day)
);
create index absence_subject on absence (organization_id, subject, from_day);

create table allocation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  -- nominative (subject) ou générique (équipe et rôle) ; une allocation nominative remplace le besoin générique
  subject text check (subject is null or char_length(subject) between 1 and 200),
  team_id uuid references team(id) on delete cascade,
  role_label text check (role_label is null or char_length(role_label) between 1 and 100),
  from_day date not null,
  to_day date,
  fte numeric(5, 3) not null check (fte > 0 and fte <= 20),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (to_day is null or to_day >= from_day),
  check ((subject is not null and team_id is null and role_label is null) or (subject is null and team_id is not null and role_label is not null))
);
create index allocation_project on allocation (project_id);
create index allocation_subject on allocation (organization_id, subject);

alter table person_availability enable row level security;
alter table person_availability force row level security;
create policy org_isolation on person_availability using (organization_id = current_org()) with check (organization_id = current_org());
alter table absence enable row level security;
alter table absence force row level security;
create policy org_isolation on absence using (organization_id = current_org()) with check (organization_id = current_org());
alter table allocation enable row level security;
alter table allocation force row level security;
create policy org_isolation on allocation using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on allocation as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert, update, delete on person_availability to athena_app;
grant select, insert, update, delete on absence to athena_app;
grant select, insert, update, delete on allocation to athena_app;
