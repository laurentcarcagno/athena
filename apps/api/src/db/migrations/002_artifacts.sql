-- 002 : artefacts, révisions, liens, commentaires, numérotation par tracker.
create table artifact (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  tracker_id uuid not null,
  number bigint not null,
  key text not null,
  status_id uuid not null,
  "values" jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tracker_id, organization_id) references tracker(id, organization_id),
  foreign key (project_id, organization_id) references project(id, organization_id),
  foreign key (status_id, tracker_id) references status(id, tracker_id),
  unique (tracker_id, number),
  unique (project_id, key),
  unique (id, organization_id)
);
create index artifact_values_gin on artifact using gin ("values" jsonb_path_ops);
create index artifact_tracker_status on artifact (tracker_id, status_id);

create table artifact_revision (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  artifact_id uuid not null,
  version integer not null,
  diff jsonb not null,
  actor text not null,
  event_id uuid not null default gen_random_uuid(),
  git_sha text,
  created_at timestamptz not null default now(),
  foreign key (artifact_id, organization_id) references artifact(id, organization_id) on delete cascade,
  unique (artifact_id, version)
);

create table artifact_link (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  from_artifact_id uuid not null,
  to_artifact_id uuid not null,
  link_type_id uuid not null,
  suspect boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (from_artifact_id, organization_id) references artifact(id, organization_id) on delete cascade,
  foreign key (to_artifact_id, organization_id) references artifact(id, organization_id) on delete cascade,
  foreign key (link_type_id, organization_id) references link_type(id, organization_id),
  check (from_artifact_id <> to_artifact_id),
  unique (from_artifact_id, to_artifact_id, link_type_id)
);

create table comment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  artifact_id uuid not null,
  author text not null,
  body text not null check (length(body) between 1 and 100000),
  created_at timestamptz not null default now(),
  foreign key (artifact_id, organization_id) references artifact(id, organization_id) on delete cascade
);

-- Numéro suivant d'un tracker, atomique et sans trou sous concurrence.
create function next_artifact_number(p_tracker uuid) returns bigint language sql as $$
  insert into tracker_sequence (tracker_id, organization_id, last_number)
    select id, organization_id, 1 from tracker where id = p_tracker
  on conflict (tracker_id) do update set last_number = tracker_sequence.last_number + 1
  returning last_number
$$;
