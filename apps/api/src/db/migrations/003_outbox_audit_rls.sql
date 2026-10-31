-- 003 : outbox transactionnelle, journal d'audit chaîné par hachage, RLS et droits.
create table outbox_event (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index outbox_unpublished on outbox_event (created_at) where published_at is null;

create table audit_log (
  seq bigserial primary key,
  organization_id uuid not null,
  actor text not null,
  action text not null,
  target text not null,
  detail jsonb not null default '{}'::jsonb,
  at timestamptz not null default now(),
  prev_hash text,
  hash text not null default ''
);
create index audit_log_org_seq on audit_log (organization_id, seq);

-- Chaque entrée contient le hachage de la précédente de la même organisation.
create function audit_log_chain() returns trigger language plpgsql as $$
declare previous text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 0));
  select hash into previous from audit_log
    where organization_id = new.organization_id order by seq desc limit 1;
  new.prev_hash := previous;
  new.hash := encode(digest(
    coalesce(previous, '') || '|' || new.organization_id::text || '|' || new.actor || '|' ||
    new.action || '|' || new.target || '|' || new.detail::text || '|' || new.at::text,
    'sha256'), 'hex');
  return new;
end $$;
create trigger audit_log_chain_trg before insert on audit_log
  for each row execute function audit_log_chain();

create function audit_log_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_log est en ajout seul'; end $$;
create trigger audit_log_no_update before update or delete on audit_log
  for each row execute function audit_log_immutable();

-- Row Level Security : activée et forcée partout.
do $$
declare t text;
begin
  foreach t in array array['project','tracker','tracker_sequence','field_definition','status',
    'transition','link_type','artifact','artifact_revision','artifact_link','comment',
    'outbox_event','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
  end loop;
end $$;

alter table organization enable row level security;
alter table organization force row level security;
create policy org_isolation on organization using (id = current_org()) with check (id = current_org());

-- Droits du rôle applicatif (moindre privilège).
grant usage on schema public to athena_app;
grant select, insert, update, delete on organization, project, tracker, tracker_sequence,
  field_definition, status, transition, link_type, artifact, artifact_revision, artifact_link,
  comment to athena_app;
grant select, insert on audit_log to athena_app;
grant select, insert, update (published_at) on outbox_event to athena_app;
grant usage on all sequences in schema public to athena_app;
grant execute on function current_org(), next_artifact_number(uuid) to athena_app;
