-- 082 : priorisation et scénarios (Lot 25, étude PPM § 2.11). Un modèle de scoring est versionné : changer les poids crée une nouvelle version, les notes des anciennes
-- versions restent lisibles. Un scénario ne vit que dans ses propres tables : il lit le plan officiel et n'écrit jamais dedans.
create table scoring_model (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  portfolio_id uuid not null references portfolio(id) on delete cascade,
  version integer not null check (version >= 1),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (portfolio_id, version)
);
create table scoring_criterion (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  model_id uuid not null references scoring_model(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_-]{1,29}$'),
  label text not null check (char_length(label) between 1 and 100),
  weight numeric(6, 3) not null check (weight > 0 and weight <= 1000),
  scale_min numeric(8, 2) not null,
  scale_max numeric(8, 2) not null,
  -- 'higher' : plus c'est haut, mieux c'est ; 'lower' : plus c'est bas, mieux c'est (coût, risque)
  direction text not null check (direction in ('higher', 'lower')),
  unique (model_id, key),
  check (scale_max > scale_min)
);
create table score (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  model_id uuid not null references scoring_model(id) on delete cascade,
  target_artifact_id uuid not null references artifact(id) on delete cascade,
  criterion text not null,
  value numeric(10, 2) not null,
  scored_by text not null,
  scored_at timestamptz not null default now(),
  unique (model_id, target_artifact_id, criterion)
);
create index score_target on score (target_artifact_id);

create table request_conversion (
  artifact_id uuid primary key references artifact(id) on delete cascade,
  organization_id uuid not null references organization(id),
  outcome text not null check (outcome in ('converted', 'refused')),
  project_id uuid references project(id) on delete set null,
  template_key text,
  reason text not null default '' check (char_length(reason) <= 2000),
  decided_by text not null,
  decided_at timestamptz not null default now(),
  check ((outcome = 'converted' and project_id is not null) or (outcome = 'refused' and char_length(btrim(reason)) > 0))
);

create table scenario (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  portfolio_id uuid not null references portfolio(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  base_snapshot_id uuid references portfolio_snapshot(id) on delete set null,
  author text not null,
  created_at timestamptz not null default now()
);
create table scenario_change (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  scenario_id uuid not null references scenario(id) on delete cascade,
  kind text not null check (kind in ('shift_ticket', 'allocate', 'budget_delta')),
  target text not null check (char_length(target) between 1 and 100),
  payload jsonb not null
);
do $$
declare t text;
begin
  foreach t in array array['scoring_model', 'scoring_criterion', 'score', 'request_conversion', 'scenario', 'scenario_change'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
  end loop;
end $$;
create policy acl_read on score as restrictive for all using ((select acl_off()) or acl_artifact_ok(target_artifact_id)) with check ((select acl_off()) or acl_artifact_ok(target_artifact_id));
create policy acl_read on request_conversion as restrictive for all using ((select acl_off()) or acl_artifact_ok(artifact_id)) with check ((select acl_off()) or acl_artifact_ok(artifact_id));
grant select, insert, update, delete on scoring_model, scoring_criterion, score, request_conversion, scenario, scenario_change to athena_app;
