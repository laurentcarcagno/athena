-- 079 : dépendances entre projets (Lot 22, étude PPM § 2.8). Un ticket d'un projet précède un ticket d'un autre projet de la même organisation,
-- avec un décalage en jours ouvrés. Le lien suit la visibilité de ses deux extrémités (`acl_link_ok`). La propagation d'un retard est un calcul
-- de portefeuille en lecture seule ; rien n'est écrit dans le planning de l'autre projet.
create table project_dependency (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  from_artifact_id uuid not null references artifact(id) on delete cascade,
  to_artifact_id uuid not null references artifact(id) on delete cascade,
  from_project_id uuid not null references project(id) on delete cascade,
  to_project_id uuid not null references project(id) on delete cascade,
  lag_days integer not null default 0 check (lag_days between -365 and 365),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (from_artifact_id, to_artifact_id),
  check (from_project_id <> to_project_id)
);
create index project_dependency_from on project_dependency (from_project_id);
create index project_dependency_to on project_dependency (to_project_id);
alter table project_dependency enable row level security;
alter table project_dependency force row level security;
create policy org_isolation on project_dependency using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on project_dependency as restrictive for all
  using ((select acl_off()) or acl_link_ok(from_artifact_id, to_artifact_id)) with check ((select acl_off()) or acl_link_ok(from_artifact_id, to_artifact_id));
grant select, insert, update, delete on project_dependency to athena_app;
