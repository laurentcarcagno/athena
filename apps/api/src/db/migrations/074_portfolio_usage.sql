-- 074 : journal d'usage agrégé des routes de portefeuille (Lot 18, B26, KPI 6). Un compteur par jour, rôle et route : ni identité, ni contenu,
-- ni clé de projet ou de portefeuille. Aucune donnée personnelle n'est conservée.
create table portfolio_usage (
  organization_id uuid not null references organization(id),
  usage_day date not null,
  role text not null check (role in ('admin', 'pmo', 'director', 'pm', 'manager', 'other')),
  route text not null check (route in ('list', 'summary', 'detail', 'health', 'health_csv')),
  hits integer not null default 0 check (hits >= 0),
  primary key (organization_id, usage_day, role, route)
);
alter table portfolio_usage enable row level security;
alter table portfolio_usage force row level security;
create policy org_isolation on portfolio_usage using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update on portfolio_usage to athena_app;
