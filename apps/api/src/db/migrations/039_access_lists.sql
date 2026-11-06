-- 039 : listes d'ayants droit (besoin d'en connaître), ADR-0002 Lot 4.
-- Un projet (ou un tracker) doté d'une liste n'est lisible que de ses membres, administrateurs d'organisation compris.
-- L'application est dans la base : des politiques RLS *restrictives* (qui s'ajoutent à l'isolation par organisation) filtrent les
-- lectures et les écritures, donc la recherche, l'ATQL, le plein texte, les tableaux de bord, les compteurs et les liens ne peuvent
-- pas fuiter, quel que soit le service qui interroge. Le sujet courant est posé par transaction (`app.subject`) avec les listes
-- qui lui sont refusées ; sans sujet (traitements système : historique, webhooks entrants), rien n'est filtré.
create table access_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  project_id uuid not null,
  tracker_id uuid,
  created_by text not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id) on delete cascade,
  foreign key (tracker_id, organization_id) references tracker(id, organization_id) on delete cascade
);
create unique index access_list_project on access_list (project_id) where tracker_id is null;
create unique index access_list_tracker on access_list (tracker_id) where tracker_id is not null;

create table access_list_member (
  access_list_id uuid not null references access_list(id) on delete cascade,
  organization_id uuid not null references organization(id),
  subject text not null check (char_length(subject) between 1 and 200),
  added_by text not null,
  added_at timestamptz not null default now(),
  primary key (access_list_id, subject)
);
create index access_list_member_subject on access_list_member (subject);

alter table access_list enable row level security;
alter table access_list force row level security;
create policy org_isolation on access_list using (organization_id = current_org()) with check (organization_id = current_org());
alter table access_list_member enable row level security;
alter table access_list_member force row level security;
create policy org_isolation on access_list_member using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on access_list, access_list_member to athena_app;

-- Projets et trackers refusés au sujet courant (listes de ces portées dont il n'est pas membre), posés en début de transaction.
create function acl_off() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.denied_projects', true), '') = '' and coalesce(current_setting('app.denied_trackers', true), '') = '' $$;
create function acl_allows(p uuid, t uuid) returns boolean language sql stable as
  $$ select (p is null or not (p::text = any (string_to_array(coalesce(current_setting('app.denied_projects', true), ''), ','))))
        and (t is null or not (t::text = any (string_to_array(coalesce(current_setting('app.denied_trackers', true), ''), ',')))) $$;
-- Chaque politique commence par `(select acl_off())` : sous-requête non corrélée évaluée une fois par requête, et le OU court-circuite
-- la condition coûteuse (et l'empêche d'être transformée en jointure). Sans liste, une lecture ne coûte donc rien de plus.
-- Contrôles par jointure : fonctions à coût déclaré faible et non « inlinées » (SET), pour que le planificateur ne les prenne pas pour
-- des sous-requêtes coûteuses et conserve ses plans quand aucune liste n'existe.
create function acl_artifact_ok(a uuid) returns boolean language sql stable cost 1 set search_path = public as $$ select exists (select 1 from artifact where id = a) $$;
create function acl_tracker_ok(t uuid) returns boolean language sql stable cost 1 set search_path = public as $$ select exists (select 1 from tracker where id = t) $$;
create function acl_docsource_ok(s uuid) returns boolean language sql stable cost 1 set search_path = public as $$ select exists (select 1 from doc_source where id = s) $$;
create function acl_inbound_ok(s uuid) returns boolean language sql stable cost 1 set search_path = public as $$ select exists (select 1 from inbound_source where id = s) $$;
create function acl_link_ok(a uuid, b uuid) returns boolean language sql stable cost 1 set search_path = public as $$ select acl_artifact_ok(a) and acl_artifact_ok(b) $$;
-- Favoris et récents : référencent projet, tracker ou item par clé (texte) ; ils disparaissent pour qui n'a plus le droit de lire la cible.
create function acl_pin_ok(kind text, project_key text, ref text) returns boolean language sql stable cost 1 set search_path = public as
  $$ select exists (select 1 from project where key = project_key)
        and (kind <> 'tracker' or exists (select 1 from tracker t join project p on p.id = t.project_id where p.key = project_key and t.key = ref))
        and (kind <> 'item' or exists (select 1 from artifact where key = ref)) $$;
grant execute on function acl_off(), acl_allows(uuid, uuid), acl_artifact_ok(uuid), acl_tracker_ok(uuid), acl_docsource_ok(uuid), acl_inbound_ok(uuid), acl_link_ok(uuid, uuid), acl_pin_ok(text, text, text) to athena_app;

-- Politiques restrictives : ET logique avec l'isolation par organisation.
create policy acl_read on project as restrictive for all using ((select acl_off()) or acl_allows(id, null)) with check ((select acl_off()) or acl_allows(id, null));
create policy acl_read on tracker as restrictive for all using ((select acl_off()) or acl_allows(project_id, id)) with check ((select acl_off()) or acl_allows(project_id, id));
create policy acl_read on artifact as restrictive for all using ((select acl_off()) or acl_allows(project_id, tracker_id)) with check ((select acl_off()) or acl_allows(project_id, tracker_id));

do $$
declare t text;
begin
  -- tables portant project_id
  foreach t in array array['artifact_key_alias', 'automation_rule', 'baseline', 'board', 'code_repo', 'coverage_rule', 'doc_source', 'import_map',
                           'inbound_source', 'link_type', 'project_member', 'release', 'saved_filter', 'sprint', 'tailoring'] loop
    execute format('create policy acl_read on %I as restrictive for all using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null))', t);
  end loop;
  -- tables rattachées à un tracker
  foreach t in array array['field_definition', 'status', 'transition', 'tracker_sequence'] loop
    execute format('create policy acl_read on %I as restrictive for all using ((select acl_off()) or acl_tracker_ok(%I.tracker_id)) with check ((select acl_off()) or acl_tracker_ok(%I.tracker_id))', t, t, t);
  end loop;
  -- tables rattachées à un artefact
  foreach t in array array['artifact_revision', 'attachment', 'backport', 'code_ref', 'comment', 'doc_link', 'release_item', 'sprint_item'] loop
    execute format('create policy acl_read on %I as restrictive for all using ((select acl_off()) or acl_artifact_ok(%I.artifact_id)) with check ((select acl_off()) or acl_artifact_ok(%I.artifact_id))', t, t, t);
  end loop;
  -- tables rattachées à une source documentaire ou entrante
  execute 'create policy acl_read on doc_node as restrictive for all using ((select acl_off()) or acl_docsource_ok(doc_node.source_id)) with check ((select acl_off()) or acl_docsource_ok(doc_node.source_id))';
  execute 'create policy acl_read on inbound_event as restrictive for all using ((select acl_off()) or acl_inbound_ok(inbound_event.source_id)) with check ((select acl_off()) or acl_inbound_ok(inbound_event.source_id))';
end $$;

-- Un lien n'est visible que si ses deux extrémités le sont (sinon il révélerait l'existence de l'item caché).
create policy acl_read on artifact_link as restrictive for all
  using ((select acl_off()) or acl_link_ok(artifact_link.from_artifact_id, artifact_link.to_artifact_id))
  with check ((select acl_off()) or acl_link_ok(artifact_link.from_artifact_id, artifact_link.to_artifact_id));

create policy acl_read on user_pin as restrictive for all
  using ((select acl_off()) or acl_pin_ok(kind, project_key, ref)) with check ((select acl_off()) or acl_pin_ok(kind, project_key, ref));
