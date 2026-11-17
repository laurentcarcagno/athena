-- 083 : indicateurs de projet matérialisés (Lot 26, B42). Mesure au palier 2 (300 projets, 500 000 tickets) : le tableau de santé calculé à la lecture dépasse 10 s ;
-- un job écrit une ligne par projet en contexte système, la lecture passe par la politique de visibilité du projet. Une ligne plus vieille que le délai de fraîcheur
-- est ignorée : la lecture retombe sur le calcul direct.
create table project_kpi (
  project_id uuid primary key references project(id) on delete cascade,
  organization_id uuid not null references organization(id),
  metrics jsonb not null,
  computed_at timestamptz not null default now()
);
alter table project_kpi enable row level security;
alter table project_kpi force row level security;
create policy org_isolation on project_kpi using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on project_kpi as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert, update, delete on project_kpi to athena_app;
