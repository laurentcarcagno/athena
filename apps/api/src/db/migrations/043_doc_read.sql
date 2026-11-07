-- 043 : consultation des documents StrictDoc (ADR-0002, Lot 5).
-- `doc_node` garde l'ordre de lecture, la profondeur et la section parente de chaque nœud (ré-indexation incrémentale par UID),
-- l'identifiant stable du document et un index plein texte. `doc_source` retient d'où viennent les fichiers (dépôt, référence,
-- sous-dossier) pour pointer vers la source et détecter un index en retard sur le dépôt. `baseline_doc_node` fige, à la
-- création d'une baseline, l'empreinte de chaque exigence indexée : c'est ce qui permet de comparer deux baselines.
alter table doc_source add column repo_path text, add column ref text, add column sub_path text;
alter table doc_node
  add column doc_id text not null default '',
  add column doc_path text not null default '',
  add column position integer not null default 0,
  add column parent_uid text,
  add column depth integer not null default 0,
  add column synthetic boolean not null default false,
  add column search_tsv tsvector generated always as (to_tsvector('simple', uid || ' ' || coalesce(title, '') || ' ' || coalesce(statement, ''))) stored;
create index doc_node_search on doc_node using gin (search_tsv);
create index doc_node_order on doc_node (source_id, doc_id, position);
create index doc_node_uid_prefix on doc_node (uid text_pattern_ops);

create table baseline_doc_node (
  baseline_id uuid not null references baseline(id) on delete cascade,
  organization_id uuid not null references organization(id),
  source_name text not null,
  uid text not null,
  title text not null default '',
  content_hash text not null,
  primary key (baseline_id, source_name, uid)
);
alter table baseline_doc_node enable row level security;
alter table baseline_doc_node force row level security;
create policy org_isolation on baseline_doc_node using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on baseline_doc_node as restrictive for all
  using ((select acl_off()) or exists (select 1 from baseline b where b.id = baseline_doc_node.baseline_id))
  with check ((select acl_off()) or exists (select 1 from baseline b where b.id = baseline_doc_node.baseline_id));
grant select, insert, delete on baseline_doc_node to athena_app;
