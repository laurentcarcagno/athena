-- 017 : correspondance entre clés externes (JIRA, Tuleap) et artefacts Athena : ré-import idempotent et résolution des liens.
create table import_map (
  organization_id uuid not null,
  project_id uuid not null,
  source text not null check (source in ('jira', 'tuleap')),
  external_key text not null check (length(external_key) between 1 and 100),
  artifact_key text not null,
  imported_at timestamptz not null default now(),
  primary key (organization_id, project_id, source, external_key),
  foreign key (project_id, organization_id) references project(id, organization_id)
);
alter table import_map enable row level security;
alter table import_map force row level security;
create policy org_isolation on import_map using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, delete on import_map to athena_app;
