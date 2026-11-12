-- 059 : calendrier d'organisation (Lot 12, T-0160, ADR-0006 § 2.4). Semaine ouvrée (jours ISO : 1 = lundi … 7 = dimanche)
-- et jours fériés ; sans ligne, l'organisation travaille du lundi au vendredi sans jour férié.
create table organization_calendar (
  organization_id uuid primary key references organization(id),
  work_days smallint[] not null default '{1,2,3,4,5}' check (cardinality(work_days) between 1 and 7 and work_days <@ array[1,2,3,4,5,6,7]::smallint[]),
  updated_at timestamptz not null default now()
);

create table calendar_holiday (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  day date not null,
  label text not null check (length(label) between 1 and 100),
  unique (organization_id, day)
);

alter table organization_calendar enable row level security;
alter table organization_calendar force row level security;
create policy org_isolation on organization_calendar using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on organization_calendar to athena_app;

alter table calendar_holiday enable row level security;
alter table calendar_holiday force row level security;
create policy org_isolation on calendar_holiday using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on calendar_holiday to athena_app;
