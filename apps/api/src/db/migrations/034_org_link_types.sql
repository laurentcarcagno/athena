-- 034 : types de liens d'organisation (ADR-0002, Lot 2). `project_id` nul = type de l'organisation, utilisable dans tous ses
-- projets ; un type de projet de même clé le surcharge dans son projet. Les types existants (par projet) ne changent pas.
-- `link_type_pair` limite les types de tracker qu'un type d'organisation relie ; sans paire, aucune restriction.
alter table link_type alter column project_id drop not null;
create unique index link_type_org_key on link_type (organization_id, key) where project_id is null;

create table link_type_pair (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  link_type_id uuid not null,
  from_tracker_type text not null check (from_tracker_type ~ '^[a-z][a-z0-9-]{1,39}$'),
  to_tracker_type text not null check (to_tracker_type ~ '^[a-z][a-z0-9-]{1,39}$'),
  foreign key (link_type_id, organization_id) references link_type(id, organization_id) on delete cascade,
  unique (link_type_id, from_tracker_type, to_tracker_type)
);
alter table link_type_pair enable row level security;
alter table link_type_pair force row level security;
create policy org_isolation on link_type_pair using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on link_type_pair to athena_app;
grant update, delete on link_type to athena_app;
