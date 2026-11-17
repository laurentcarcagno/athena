-- 080 : finances (Lot 23, étude PPM § 2.10). Montants en numeric(14,2) dans la devise de l'organisation. Budget en ajout seul (initial, avenants, arbitrages) ;
-- engagements, réels, prévisions saisis par la finance ; réels importables par fichier, de façon idempotente (empreinte). Les taux des ressources ne sont
-- lisibles que de la finance et de l'administration (contrôle dans le service) ; toute table de projet reçoit sa politique restrictive `acl_read`.
create table expense_category (
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z][a-z0-9_-]{1,29}$'),
  name text not null check (char_length(name) between 1 and 100),
  kind text not null check (kind in ('internal', 'external', 'license', 'hardware', 'service')),
  primary key (organization_id, key)
);

create table budget_line (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  category text not null,
  phase text,
  kind text not null check (kind in ('initial', 'amendment', 'arbitration')),
  amount numeric(14, 2) not null,
  reason text not null default '' check (char_length(reason) <= 500),
  created_by text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, category) references expense_category(organization_id, key)
);
create index budget_line_project on budget_line (project_id);

create table commitment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  category text not null,
  amount numeric(14, 2) not null check (amount >= 0),
  reference text not null default '' check (char_length(reference) <= 100),
  committed_on date not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, category) references expense_category(organization_id, key)
);
create index commitment_project on commitment (project_id);

create table import_batch (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  file_name text not null check (char_length(file_name) <= 200),
  sha256 text not null,
  rows_total integer not null,
  rows_imported integer not null,
  rows_rejected integer not null,
  imported_by text not null,
  imported_at timestamptz not null default now(),
  unique (organization_id, sha256)
);

create table actual_cost (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  category text not null,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric(14, 2) not null,
  source text not null check (source in ('manual', 'import')),
  import_batch_id uuid references import_batch(id) on delete set null,
  created_by text not null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, category) references expense_category(organization_id, key)
);
create index actual_cost_project on actual_cost (project_id, period);

create table forecast (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  category text not null,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric(14, 2) not null check (amount >= 0),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  unique (project_id, category, period),
  foreign key (organization_id, category) references expense_category(organization_id, key)
);

create table resource_rate (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  subject text,
  role_label text,
  hourly_rate numeric(10, 2) not null check (hourly_rate >= 0),
  valid_from date not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  check ((subject is not null and role_label is null) or (subject is null and role_label is not null))
);

do $$
declare t text;
begin
  foreach t in array array['expense_category', 'budget_line', 'commitment', 'import_batch', 'actual_cost', 'forecast', 'resource_rate'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
  end loop;
  foreach t in array array['budget_line', 'commitment', 'actual_cost', 'forecast'] loop
    execute format('create policy acl_read on %I as restrictive for all using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null))', t);
  end loop;
end $$;
grant select, insert, update, delete on expense_category, commitment, actual_cost, forecast, import_batch, resource_rate to athena_app;
-- le budget est en ajout seul : ni modification ni suppression
grant select, insert on budget_line to athena_app;
