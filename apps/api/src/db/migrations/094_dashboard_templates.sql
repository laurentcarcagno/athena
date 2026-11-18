-- 094 : gabarits de tableaux de bord (lot 27).
-- Les gabarits livrés sont dans le code ; l'organisation ajoute les siens (`dashboard_template`), peut masquer un gabarit livré
-- (`dashboard_template_hidden`) et désigner, par type de tableau de bord et par rôle, le gabarit affiché tant qu'une personne
-- n'a rien enregistré (`dashboard_template_default`).

create table dashboard_template (
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z][a-z0-9-]{2,39}$'),
  type text not null check (type in ('home', 'project', 'progress', 'portfolio')),
  name text not null check (length(name) between 1 and 100),
  description text not null default '' check (length(description) <= 500),
  roles text[] not null default '{}',
  natures text[] not null default '{}',
  project_roles text[] not null default '{}',
  tabs jsonb not null check (jsonb_typeof(tabs) = 'array' and jsonb_array_length(tabs) between 1 and 9),
  derived_from text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);

create table dashboard_template_hidden (
  organization_id uuid not null references organization(id),
  key text not null,
  primary key (organization_id, key)
);

create table dashboard_template_default (
  organization_id uuid not null references organization(id),
  type text not null check (type in ('home', 'project', 'progress', 'portfolio')),
  role text not null,
  template_key text not null,
  primary key (organization_id, type, role)
);

alter table dashboard_template enable row level security;
alter table dashboard_template force row level security;
create policy org_isolation on dashboard_template using (organization_id = current_org()) with check (organization_id = current_org());
alter table dashboard_template_hidden enable row level security;
alter table dashboard_template_hidden force row level security;
create policy org_isolation on dashboard_template_hidden using (organization_id = current_org()) with check (organization_id = current_org());
alter table dashboard_template_default enable row level security;
alter table dashboard_template_default force row level security;
create policy org_isolation on dashboard_template_default using (organization_id = current_org()) with check (organization_id = current_org());

grant select, insert, update, delete on dashboard_template, dashboard_template_hidden, dashboard_template_default to athena_app;
