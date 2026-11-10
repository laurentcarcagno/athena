-- 048 : rang du backlog (ADR-0003 § 2.6, Lot 9, T-0115).
-- Le backlog d'un projet regroupe les tickets des trackers de type Tâche. Le rang n'est pas une valeur de champ : il ne crée
-- ni révision ni commit, et vit à part. Un ticket sans rang se range après les tickets classés, par date de création.

create table backlog_rank (
  artifact_id uuid primary key references artifact(id) on delete cascade,
  organization_id uuid not null references organization(id),
  project_id uuid not null,
  rank integer not null,
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id) on delete cascade
);
create index backlog_rank_order on backlog_rank (project_id, rank);

alter table backlog_rank enable row level security;
alter table backlog_rank force row level security;
create policy org_isolation on backlog_rank using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on backlog_rank as restrictive for all
  using ((select acl_off()) or (acl_allows(project_id, null) and acl_artifact_ok(artifact_id)))
  with check ((select acl_off()) or (acl_allows(project_id, null) and acl_artifact_ok(artifact_id)));

grant select, insert, update, delete on backlog_rank to athena_app;
