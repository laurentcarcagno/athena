-- 064 : confirmations des critères manuels de passage de phase, et filtre des droits sur les tables d'agrégat (étude PPM, P2 et P6).
-- Un critère manuel (« Baseline RB approuvée à la SRR ») n'est rempli que lorsqu'une personne habilitée l'a confirmé : qui, quand, avec
-- quelle note. Les critères sont identifiés par leur phase, leur nature (sortie de la phase, entrée de la suivante) et leur libellé.
create table phase_criterion_check (
  organization_id uuid not null references organization(id),
  project_id uuid not null references project(id) on delete cascade,
  phase text not null check (phase ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  stage text not null check (stage in ('entry', 'exit')),
  label text not null check (char_length(label) between 1 and 200),
  note text not null default '' check (char_length(note) <= 500),
  checked_by text not null,
  checked_at timestamptz not null default now(),
  primary key (project_id, phase, stage, label)
);
alter table phase_criterion_check enable row level security;
alter table phase_criterion_check force row level security;
create policy org_isolation on phase_criterion_check using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on phase_criterion_check as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
grant select, insert, update, delete on phase_criterion_check to athena_app;

-- Un portefeuille ne laisse rien apprendre d'un projet masqué par une liste d'ayants droit : ni sa ligne, ni leur nombre.
create policy acl_read on portfolio_project as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));

-- Dates figées d'une baseline : visibles seulement si la baseline (donc son projet) l'est, et si le tracker du ticket l'est
-- (le deuxième segment de la clé `PROJET-TRACKER-0001` désigne le tracker).
create policy acl_read on baseline_schedule as restrictive for all
  using ((select acl_off()) or exists (
    select 1 from baseline b join tracker t on t.project_id = b.project_id and t.key = split_part(baseline_schedule.artifact_key, '-', 2)
     where b.id = baseline_schedule.baseline_id))
  with check ((select acl_off()) or exists (select 1 from baseline b where b.id = baseline_schedule.baseline_id));
