-- 046 : circuits d'approbation des items (ADR-0002, Lot 7, T-0094).
-- Un tracker peut porter un circuit : des étapes ordonnées (relecture ou approbation), chacune confiée à des personnes nommées ou au
-- rôle « assurance qualité étatique », avec un nombre minimal de décisions favorables. Les décisions réutilisent la table `approval`
-- de T-0080 (nominatives, horodatées) ; une modification de contenu de l'item invalide les décisions en cours (conservées, marquées).

create table approval_flow (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null,
  tracker_id uuid not null,
  enabled boolean not null default true,
  created_by text not null,
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id) on delete cascade,
  foreign key (tracker_id, organization_id) references tracker(id, organization_id) on delete cascade,
  unique (tracker_id)
);

create table approval_step (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  flow_id uuid not null references approval_flow(id) on delete cascade,
  position smallint not null check (position between 1 and 20),
  name text not null check (char_length(name) between 1 and 120),
  kind text not null check (kind in ('review', 'approval')),
  /** Personnes nommées (sujets) autorisées à décider à cette étape. */
  approvers text[] not null default '{}',
  /** Rôle autorisé à décider (en plus des personnes nommées) : l'assurance qualité étatique. */
  approver_role text check (approver_role is null or approver_role = 'athena-qa'),
  min_approvals smallint not null default 1 check (min_approvals between 1 and 20),
  unique (flow_id, position),
  check (cardinality(approvers) > 0 or approver_role is not null)
);

alter table approval_flow enable row level security;
alter table approval_flow force row level security;
create policy org_isolation on approval_flow using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on approval_flow as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, tracker_id)) with check ((select acl_off()) or acl_allows(project_id, tracker_id));
alter table approval_step enable row level security;
alter table approval_step force row level security;
create policy org_isolation on approval_step using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on approval_step as restrictive for all
  using ((select acl_off()) or exists (select 1 from approval_flow f where f.id = approval_step.flow_id))
  with check ((select acl_off()) or exists (select 1 from approval_flow f where f.id = approval_step.flow_id));
grant select, insert, update, delete on approval_flow, approval_step to athena_app;

-- Décisions sur les items : une par personne et par étape tant qu'elle est valide ; l'invalidation conserve la ligne.
alter table approval drop constraint approval_object_type_check;
alter table approval add constraint approval_object_type_check check (object_type in ('release', 'baseline', 'item'));
alter table approval drop constraint approval_object_type_object_id_approver_key;
create unique index approval_object_approver on approval (object_type, object_id, approver) where object_type <> 'item';
alter table approval add column step_id uuid references approval_step(id) on delete set null;
alter table approval add column object_version integer;
alter table approval add column invalidated_at timestamptz;
alter table approval add column invalidated_version integer;
create unique index approval_item_step_approver on approval (object_id, step_id, approver) where object_type = 'item' and invalidated_at is null;
-- Les décisions d'un item suivent les droits de l'item (liste d'ayants droit du tracker, contrôle export), pas seulement ceux du projet.
create policy acl_item on approval as restrictive for all
  using ((select acl_off()) or object_type <> 'item' or acl_artifact_ok(object_id))
  with check ((select acl_off()) or object_type <> 'item' or acl_artifact_ok(object_id));
