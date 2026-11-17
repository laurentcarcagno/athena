-- 069 : phases datées et décisions de gate (Lot 17, étude PPM § 2.3). Une ligne par projet et par phase du gabarit épinglé, créée à la
-- première écriture (sans ligne, tout est vide : rien à migrer). Une phase retirée par une nouvelle version du gabarit garde sa ligne.
create table project_phase (
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  phase text not null check (char_length(phase) between 1 and 80),
  planned_start date,
  planned_end date,
  review_planned_on date,
  review_held_on date,
  decision text check (decision is null or decision in ('go', 'go_with_reserves', 'no_go')),
  decided_by text,
  decided_at timestamptz,
  note text not null default '' check (char_length(note) <= 2000),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (project_id, phase),
  check (planned_start is null or planned_end is null or planned_end >= planned_start),
  -- une décision porte toujours son auteur et sa date ; go_with_reserves et no_go portent une note
  check (decision is null or (decided_by is not null and decided_at is not null)),
  check (decision is null or decision = 'go' or char_length(btrim(note)) > 0)
);
-- Historique des dates prévues (courbe de tendance des jalons) : ajout seul.
create table project_phase_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  phase text not null,
  field text not null check (field in ('planned_end', 'review_planned_on')),
  old_value date,
  new_value date,
  changed_by text not null,
  changed_at timestamptz not null default clock_timestamp()
);
create index project_phase_history_project on project_phase_history (project_id, phase, changed_at);

alter table project_phase enable row level security;
alter table project_phase force row level security;
create policy org_isolation on project_phase using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on project_phase as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
alter table project_phase_history enable row level security;
alter table project_phase_history force row level security;
create policy org_isolation on project_phase_history using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on project_phase_history as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert, update, delete on project_phase to athena_app;
grant select, insert on project_phase_history to athena_app;
