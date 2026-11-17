-- 075 : instantanés de portefeuille et revues (Lot 20, étude PPM § 2.5 et 2.6). Un instantané fige, par projet, la santé et ses indicateurs ;
-- aucun total n'est stocké (ils se recalculent à la lecture sur les lignes visibles). Les lignes sont filtrées par la politique restrictive
-- `acl_read` : un lecteur privé d'un projet ne trouve aucune trace de ce projet dans un instantané.
create table portfolio_snapshot (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  portfolio_id uuid not null references portfolio(id) on delete cascade,
  taken_at timestamptz not null default clock_timestamp(),
  kind text not null check (kind in ('weekly', 'monthly', 'review', 'manual')),
  -- période d'un instantané périodique (ex. « 2026-W47 », « 2026-11 ») : un seul par portefeuille et période
  period text,
  label text not null default '' check (char_length(label) <= 200),
  taken_by text not null,
  unique (portfolio_id, kind, period)
);
create index portfolio_snapshot_portfolio on portfolio_snapshot (portfolio_id, taken_at desc);

create table portfolio_snapshot_line (
  snapshot_id uuid not null references portfolio_snapshot(id) on delete cascade,
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  metrics jsonb not null,
  primary key (snapshot_id, project_id)
);
create index portfolio_snapshot_line_project on portfolio_snapshot_line (project_id);

create table portfolio_review (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  portfolio_id uuid not null references portfolio(id) on delete cascade,
  held_on date not null,
  -- l'instantané figé à la création de la revue : le dossier reprend ces valeurs, jamais celles du jour
  snapshot_id uuid not null references portfolio_snapshot(id),
  state text not null default 'draft' check (state in ('draft', 'held')),
  summary text not null default '' check (char_length(summary) <= 4000),
  created_by text not null,
  created_at timestamptz not null default now()
);
create index portfolio_review_portfolio on portfolio_review (portfolio_id, held_on desc);

alter table portfolio_snapshot enable row level security;
alter table portfolio_snapshot force row level security;
create policy org_isolation on portfolio_snapshot using (organization_id = current_org()) with check (organization_id = current_org());
alter table portfolio_snapshot_line enable row level security;
alter table portfolio_snapshot_line force row level security;
create policy org_isolation on portfolio_snapshot_line using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on portfolio_snapshot_line as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
alter table portfolio_review enable row level security;
alter table portfolio_review force row level security;
create policy org_isolation on portfolio_review using (organization_id = current_org()) with check (organization_id = current_org());

grant select, insert, delete on portfolio_snapshot to athena_app;
grant select, insert, delete on portfolio_snapshot_line to athena_app;
grant select, insert, update, delete on portfolio_review to athena_app;
