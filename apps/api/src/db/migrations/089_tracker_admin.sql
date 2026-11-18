-- 089 : administrateur de tracker (plan § 15.3 « administration déléguée »). Une personne désignée par le chef du projet configure ce tracker seulement
-- (champs, statuts, transitions, mise en page), sans être chef du projet.
create table tracker_admin (
  tracker_id uuid not null,
  organization_id uuid not null references organization(id),
  subject text not null check (char_length(subject) between 1 and 200),
  granted_by text not null,
  granted_at timestamptz not null default now(),
  primary key (tracker_id, subject),
  foreign key (tracker_id, organization_id) references tracker(id, organization_id) on delete cascade
);
alter table tracker_admin enable row level security;
alter table tracker_admin force row level security;
create policy org_isolation on tracker_admin using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, delete on tracker_admin to athena_app;
