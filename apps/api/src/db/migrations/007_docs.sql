-- 007 : liaison avec la documentation StrictDoc (plan § 16). Index en lecture seule + liens.
create table doc_source (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  name text not null check (name ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  git_sha text,
  indexed_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (project_id, name),
  unique (id, organization_id)
);

create table doc_node (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  source_id uuid not null,
  uid text not null,
  node_type text not null,
  document text not null default '',
  title text not null default '',
  statement text not null default '',
  status text not null default '',
  parents text[] not null default '{}',
  athena_refs text[] not null default '{}',
  content_hash text not null,
  foreign key (source_id, organization_id) references doc_source(id, organization_id) on delete cascade,
  unique (source_id, uid)
);
create index doc_node_uid on doc_node (uid);

create table doc_link (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  artifact_id uuid not null,
  source_id uuid not null,
  uid text not null,
  linked_hash text not null,
  suspect boolean not null default false,
  origin text not null check (origin in ('athena', 'document')),
  created_at timestamptz not null default now(),
  foreign key (artifact_id, organization_id) references artifact(id, organization_id) on delete cascade,
  foreign key (source_id, organization_id) references doc_source(id, organization_id) on delete cascade,
  unique (artifact_id, source_id, uid)
);

do $$
declare t text;
begin
  foreach t in array array['doc_source','doc_node','doc_link'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
    execute format('grant select, insert, update, delete on %I to athena_app', t);
  end loop;
end $$;
