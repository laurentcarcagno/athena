-- 052 : préférences personnelles sur le compte (ADR-0003, Lot 9, suite de T-0123).
-- Page d'accueil, langue et thème suivent la personne d'un navigateur à l'autre. Une colonne nulle = pas de préférence enregistrée
-- (le navigateur garde son réglage local).

create table user_preference (
  organization_id uuid not null references organization(id),
  owner text not null,
  home text check (home in ('work', 'projects')),
  locale text check (locale in ('fr', 'en')),
  theme text check (theme in ('system', 'light', 'dark')),
  updated_at timestamptz not null default now(),
  primary key (organization_id, owner)
);

alter table user_preference enable row level security;
alter table user_preference force row level security;
create policy org_isolation on user_preference using (organization_id = current_org()) with check (organization_id = current_org());

grant select, insert, update, delete on user_preference to athena_app;
