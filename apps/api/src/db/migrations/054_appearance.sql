-- 054 : apparence (ADR-0004, Lot 10, T-0136). L'organisation fixe le thème par défaut et la liste des thèmes proposés
-- (vide = tous) ; chaque personne choisit sa famille de thème dans cette liste (préférence du compte, nulle = navigateur).
create table organization_appearance (
  organization_id uuid primary key references organization(id),
  default_theme text not null default 'hemeria' check (default_theme ~ '^[a-z][a-z0-9-]{1,30}$'),
  allowed_themes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table organization_appearance enable row level security;
alter table organization_appearance force row level security;
create policy org_isolation on organization_appearance using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on organization_appearance to athena_app;

alter table user_preference add column theme_family text check (theme_family ~ '^[a-z][a-z0-9-]{1,30}$');
