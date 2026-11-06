-- 041 : approbation des jalons (releases) et des baselines par le rôle « Assurance qualité étatique » (ADR-0002, Lot 4).
-- Une décision est nominative et horodatée, une par approbateur et par objet ; T-0094 (Lot 7) l'étendra en circuits d'approbation.
-- Un jalon ou une baseline qui requiert une approbation ne passe « approuvé » qu'avec une décision favorable et aucun refus.
alter table release add column requires_approval boolean not null default false;
alter table baseline add column requires_approval boolean not null default false;
grant update on baseline to athena_app;

create table approval (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null,
  object_type text not null check (object_type in ('release', 'baseline')),
  object_id uuid not null,
  approver text not null,
  approver_name text not null,
  decision text not null check (decision in ('approved', 'rejected')),
  comment text not null default '' check (char_length(comment) <= 2000),
  decided_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id) on delete cascade,
  unique (object_type, object_id, approver)
);
create index approval_object on approval (object_type, object_id);
alter table approval enable row level security;
alter table approval force row level security;
create policy org_isolation on approval using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on approval as restrictive for all using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert, update on approval to athena_app;
