-- 009 : boards, sprints (plan § 9.3, phase 5).
create table board (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  key text not null check (key ~ '^[a-z][a-z0-9-]{0,39}$'),
  name text not null,
  tracker_keys text[] not null check (cardinality(tracker_keys) between 1 and 20),
  columns jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (project_id, key)
);

create table sprint (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null check (length(name) between 1 and 200),
  goal text not null default '',
  state text not null default 'planned' check (state in ('planned', 'active', 'closed')),
  starts_on date,
  ends_on date,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (id, organization_id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create unique index sprint_one_active on sprint (project_id) where state = 'active';

create table sprint_item (
  sprint_id uuid not null,
  artifact_id uuid not null,
  organization_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (sprint_id, artifact_id),
  foreign key (sprint_id, organization_id) references sprint(id, organization_id) on delete cascade,
  foreign key (artifact_id, organization_id) references artifact(id, organization_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['board','sprint','sprint_item'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
    execute format('grant select, insert, update, delete on %I to athena_app', t);
  end loop;
end $$;
