-- 050 : disposition du tableau de bord personnel (ADR-0003, Lot 9, T-0122).
-- Une ligne par personne : la liste ordonnée de ses widgets. Absente, la disposition par défaut s'applique (calculée côté service).

create table dashboard_layout (
  organization_id uuid not null references organization(id),
  owner text not null,
  widgets jsonb not null check (jsonb_typeof(widgets) = 'array' and jsonb_array_length(widgets) <= 24),
  updated_at timestamptz not null default now(),
  primary key (organization_id, owner)
);

alter table dashboard_layout enable row level security;
alter table dashboard_layout force row level security;
create policy org_isolation on dashboard_layout using (organization_id = current_org()) with check (organization_id = current_org());

grant select, insert, update, delete on dashboard_layout to athena_app;
