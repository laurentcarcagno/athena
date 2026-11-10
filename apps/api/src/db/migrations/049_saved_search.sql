-- 049 : recherches enregistrées de la recherche globale (ADR-0003, Lot 9, T-0118).
-- Personnelles, hors projet : une requête ATQL et, s'il y en a, le périmètre de projets. Les droits de lecture des tickets
-- s'appliquent à l'exécution (listes d'ayants droit), jamais à l'enregistrement.

create table saved_search (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  owner text not null,
  name text not null check (char_length(name) between 1 and 100),
  query text not null check (char_length(query) <= 2000),
  projects text[] not null default '{}' check (cardinality(projects) <= 50),
  created_at timestamptz not null default now(),
  unique (organization_id, owner, name)
);

alter table saved_search enable row level security;
alter table saved_search force row level security;
create policy org_isolation on saved_search using (organization_id = current_org()) with check (organization_id = current_org());

grant select, insert, delete on saved_search to athena_app;
