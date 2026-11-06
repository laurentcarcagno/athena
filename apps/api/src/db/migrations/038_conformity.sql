-- 038 : tailoring (ADR-0002, Lot 3). Pour une clause d'une norme (référence du tracker « Exigences normatives ») et une
-- catégorie de criticité (`*` = toutes), le projet déclare la clause applicable, non applicable ou modifiée, avec sa justification.
-- Sans ligne, une clause est applicable. La justification est obligatoire pour « non applicable » et « modifiée ».
create table tailoring (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null,
  clause_key text not null check (char_length(clause_key) between 1 and 200),
  category text not null default '*' check (category ~ '^(\*|[A-Za-z0-9][A-Za-z0-9_-]{0,19})$'),
  applicability text not null check (applicability in ('applicable', 'not_applicable', 'modified')),
  justification text not null default '' check (char_length(justification) <= 2000),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  check (applicability = 'applicable' or char_length(btrim(justification)) > 0),
  foreign key (project_id, organization_id) references project(id, organization_id) on delete cascade,
  unique (project_id, clause_key, category)
);
alter table tailoring enable row level security;
alter table tailoring force row level security;
create policy org_isolation on tailoring using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on tailoring to athena_app;
