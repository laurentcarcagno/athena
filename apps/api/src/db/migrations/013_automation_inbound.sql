-- 013 : automatisations (quand / si / alors) et webhooks entrants génériques (plan § 7.2 et § 7.3).
alter table outbox_event add column automation_processed_at timestamptz;
grant update (automation_processed_at) on outbox_event to athena_app;

create table automation_rule (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null check (length(name) between 1 and 200),
  enabled boolean not null default true,
  trigger_type text not null,
  condition text not null default '',
  actions jsonb not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (id, organization_id)
);

create table automation_run (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rule_id uuid not null,
  event_id uuid not null,
  artifact_key text not null,
  status text not null check (status in ('done', 'skipped', 'failed')),
  detail text not null default '',
  at timestamptz not null default now(),
  foreign key (rule_id, organization_id) references automation_rule(id, organization_id) on delete cascade,
  unique (rule_id, event_id)
);
create index automation_run_recent on automation_run (rule_id, artifact_key, at);

create table inbound_source (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null check (name ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  mapping jsonb not null,
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (project_id, name),
  unique (id, organization_id)
);

create table inbound_event (
  organization_id uuid not null,
  source_id uuid not null,
  idempotency_key text not null,
  received_at timestamptz not null default now(),
  primary key (source_id, idempotency_key),
  foreign key (source_id, organization_id) references inbound_source(id, organization_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['automation_rule','automation_run','inbound_source','inbound_event'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
    execute format('grant select, insert, update, delete on %I to athena_app', t);
  end loop;
end $$;
