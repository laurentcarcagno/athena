-- 005 : instantanés de révision, profils utilisateurs (auteur Git), suivi de synchronisation d'historique.
alter table artifact_revision add column snapshot jsonb;
alter table outbox_event add column history_synced_at timestamptz;

create table user_account (
  organization_id uuid not null references organization(id),
  subject text not null,
  username text not null,
  display_name text not null,
  email text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, subject)
);
alter table user_account enable row level security;
alter table user_account force row level security;
create policy org_isolation on user_account
  using (organization_id = current_org()) with check (organization_id = current_org());

-- Liste des organisations pour les workers (hors contexte RLS).
create function list_organization_ids() returns setof uuid
  language sql stable security definer set search_path = public as
  $$ select id from organization order by created_at $$;
revoke all on function list_organization_ids() from public;
grant execute on function list_organization_ids() to athena_app;

grant select, insert, update, delete on user_account to athena_app;
grant update (git_sha) on artifact_revision to athena_app;
grant update (history_synced_at) on outbox_event to athena_app;
