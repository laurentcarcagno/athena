-- 016 : indicateurs de sprint figés (vélocité) et releases (roadmap).
alter table sprint add column committed_points numeric;
alter table sprint add column completed_points numeric;

create table release (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null check (length(name) between 1 and 100),
  starts_on date not null,
  ends_on date not null,
  state text not null default 'planned' check (state in ('planned', 'released')),
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (project_id, name),
  unique (id, organization_id),
  check (ends_on >= starts_on)
);

create table release_item (
  release_id uuid not null,
  artifact_id uuid not null,
  organization_id uuid not null,
  primary key (release_id, artifact_id),
  foreign key (release_id, organization_id) references release(id, organization_id) on delete cascade,
  foreign key (artifact_id, organization_id) references artifact(id, organization_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['release','release_item'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
    execute format('grant select, insert, update, delete on %I to athena_app', t);
  end loop;
end $$;
