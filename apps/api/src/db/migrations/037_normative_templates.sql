-- 037 : gabarits normatifs versionnés (ADR-0002, Lot 3).
-- Un gabarit garde ses champs historiques (`trackers`) ; les éléments normatifs (référentiel, criticité, phases, revues,
-- livrables, règles) sont dans `normative`, et un gabarit peut hériter d'un autre (`parent_key`, `parent_version`).
-- `version` est la dernière version publiée (nulle tant qu'aucune n'est publiée : les gabarits existants restent valides).
alter table project_template
  add column parent_key text check (parent_key is null or parent_key ~ '^[a-z][a-z0-9-]{1,39}$'),
  add column parent_version text check (parent_version is null or parent_version ~ '^[0-9]+(\.[0-9]+)?$'),
  add column normative jsonb not null default '{}',
  add column version text check (version is null or version ~ '^[0-9]+(\.[0-9]+)?$'),
  add column status text not null default 'draft' check (status in ('draft', 'published'));

-- Version publiée : instantané immuable et autonome (gabarit résolu, héritage compris). Aucun droit de modifier ni de supprimer.
create table project_template_version (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  template_key text not null check (template_key ~ '^[a-z][a-z0-9-]{1,39}$'),
  version text not null check (version ~ '^[0-9]+(\.[0-9]+)?$'),
  snapshot jsonb not null,
  published_by text not null,
  published_at timestamptz not null default now(),
  unique (organization_id, template_key, version)
);
alter table project_template_version enable row level security;
alter table project_template_version force row level security;
create policy org_isolation on project_template_version using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert on project_template_version to athena_app;

-- Le projet reste rattaché à une version du gabarit ; criticité et phase courante en découlent.
alter table project
  add column template_key text,
  add column template_version text,
  add column criticality text,
  add column current_phase text;
