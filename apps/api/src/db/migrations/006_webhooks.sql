-- 006 : webhooks sortants (abonnements, file de livraisons, journal).
create table webhook_endpoint (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  url text not null check (url ~ '^https?://'),
  event_types text[] not null check (cardinality(event_types) between 1 and 50),
  description text not null default '',
  active boolean not null default true,
  consecutive_failures integer not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table webhook_delivery (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  endpoint_id uuid not null,
  event_id uuid not null,
  event_type text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending','delivered','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  foreign key (endpoint_id, organization_id) references webhook_endpoint(id, organization_id) on delete cascade,
  unique (endpoint_id, event_id)
);
create index webhook_delivery_due on webhook_delivery (next_attempt_at) where status = 'pending';

do $$
declare t text;
begin
  foreach t in array array['webhook_endpoint','webhook_delivery'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
    execute format('grant select, insert, update, delete on %I to athena_app', t);
  end loop;
end $$;
