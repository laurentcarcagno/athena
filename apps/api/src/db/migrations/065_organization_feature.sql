-- 065 : interrupteurs de fonctionnalité par organisation (Lot 17, étude PPM § 06-architecture 7). Une ligne n'existe que si
-- l'organisation a pris une décision ; sans ligne, la valeur par défaut du code s'applique (`ppm/feature.service.ts`).
create table organization_feature (
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$'),
  enabled boolean not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);
alter table organization_feature enable row level security;
alter table organization_feature force row level security;
create policy org_isolation on organization_feature using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on organization_feature to athena_app;
