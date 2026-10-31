-- 011 : plugins installés par organisation et stockage clé/valeur (plan § 6).
create table plugin_installation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  plugin_id text not null,
  version text not null,
  manifest jsonb not null,
  code text not null,
  signature text not null,
  granted_permissions text[] not null default '{}',
  enabled boolean not null default true,
  installed_by text not null,
  installed_at timestamptz not null default now(),
  unique (organization_id, plugin_id)
);

create table plugin_storage (
  organization_id uuid not null references organization(id),
  plugin_id text not null,
  key text not null check (length(key) between 1 and 200),
  value jsonb not null,
  size integer not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, plugin_id, key)
);

do $$
declare t text;
begin
  foreach t in array array['plugin_installation','plugin_storage'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
    execute format('grant select, insert, update, delete on %I to athena_app', t);
  end loop;
end $$;
