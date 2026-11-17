-- 078 : temps passé (Lot 22, étude PPM § 2.9). Une ligne par personne, ticket et jour ; la durée est en minutes (saisie en heures et minutes).
-- La ligne suit la visibilité du ticket (politique restrictive `acl_artifact_ok`) : un ticket masqué n'expose pas son temps passé.
create table worklog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  artifact_id uuid not null references artifact(id) on delete cascade,
  project_id uuid not null references project(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 200),
  work_day date not null,
  minutes integer not null check (minutes between 1 and 1440),
  comment text not null default '' check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index worklog_artifact on worklog (artifact_id);
create index worklog_subject_day on worklog (organization_id, subject, work_day);
create index worklog_project_day on worklog (project_id, work_day);
alter table worklog enable row level security;
alter table worklog force row level security;
create policy org_isolation on worklog using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on worklog as restrictive for all
  using ((select acl_off()) or acl_artifact_ok(artifact_id)) with check ((select acl_off()) or acl_artifact_ok(artifact_id));
grant select, insert, update, delete on worklog to athena_app;
