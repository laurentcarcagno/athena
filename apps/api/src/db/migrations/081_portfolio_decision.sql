-- 081 : décisions de portefeuille et projets de pilotage (Lot 24, étude PPM § 2.6 et 2.7). Une décision « suspendre », « arrêter » ou « clôturer » propose une transition
-- du cycle de vie sans l'appliquer (acte du chef de projet ou de l'administrateur, tracé). Une décision « changement chiffré » peut s'appliquer en avenant de budget.
create table portfolio_decision (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  portfolio_id uuid not null references portfolio(id) on delete cascade,
  review_id uuid references portfolio_review(id) on delete set null,
  project_id uuid not null references project(id) on delete cascade,
  kind text not null check (kind in ('continue', 'suspend', 'stop', 'close', 'change')),
  rationale text not null check (char_length(rationale) between 1 and 2000),
  conditions text not null default '' check (char_length(conditions) <= 2000),
  owner text,
  due_on date,
  -- changement chiffré : variation de budget et de délai demandée ; appliquée seulement par un acte explicite
  cost_delta numeric(14, 2),
  schedule_delta_days integer,
  budget_category text,
  applied_at timestamptz,
  decided_by text not null,
  decided_at timestamptz not null default now(),
  check (kind <> 'change' or cost_delta is not null or schedule_delta_days is not null)
);
create index portfolio_decision_portfolio on portfolio_decision (portfolio_id, decided_at desc);
create index portfolio_decision_project on portfolio_decision (project_id);
alter table portfolio_decision enable row level security;
alter table portfolio_decision force row level security;
create policy org_isolation on portfolio_decision using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on portfolio_decision as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert, update on portfolio_decision to athena_app;

-- Projet de pilotage : porte les risques, actions et décisions transverses ; hors santé et roadmap.
alter table portfolio_project add column kind text not null default 'delivery' check (kind in ('delivery', 'pilot'));
alter table portfolio_project add column purpose text not null default '' check (char_length(purpose) <= 200);
