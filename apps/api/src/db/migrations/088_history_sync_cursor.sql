-- 088 : curseur de réconciliation GitLab (plan § 17.2 : les webhooks peuvent se perdre). Dernier sommet de la branche d'historique examiné par projet.
create table history_sync_cursor (
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  head_sha text not null,
  checked_at timestamptz not null default now(),
  last_result text not null default 'initialized',
  replayed integer not null default 0,
  primary key (organization_id, project_id)
);
alter table history_sync_cursor enable row level security;
alter table history_sync_cursor force row level security;
create policy org_isolation on history_sync_cursor using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update on history_sync_cursor to athena_app;
