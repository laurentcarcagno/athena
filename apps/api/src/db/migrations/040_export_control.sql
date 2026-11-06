-- 040 : marquage de contrôle export (ITAR, EAR, double usage), ADR-0002 Lot 4.
-- Un item marqué n'est lisible que des ayants droit du marquage de son projet (`export_control_member`) ; sans liste, personne ne le lit
-- (hors traitements système). Comme pour les listes d'ayants droit, le filtre est dans la base (politique restrictive sur `artifact`),
-- donc il couvre aussi la recherche, les compteurs, les tableaux de bord et les exports.
alter table artifact add column export_control text check (export_control in ('ITAR', 'EAR', 'dual_use'));
create index artifact_export_control on artifact (project_id) where export_control is not null;

create table export_control_member (
  organization_id uuid not null references organization(id),
  project_id uuid not null,
  subject text not null check (char_length(subject) between 1 and 200),
  added_by text not null,
  added_at timestamptz not null default now(),
  primary key (project_id, subject),
  foreign key (project_id, organization_id) references project(id, organization_id) on delete cascade
);
alter table export_control_member enable row level security;
alter table export_control_member force row level security;
create policy org_isolation on export_control_member using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on export_control_member to athena_app;

-- Projets où le sujet courant n'est pas ayant droit du marquage (posés en début de transaction avec les autres refus).
create or replace function acl_off() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.denied_projects', true), '') = '' and coalesce(current_setting('app.denied_trackers', true), '') = ''
        and coalesce(current_setting('app.denied_export', true), '') = '' $$;
create function acl_item_ok(p uuid, t uuid, ec text) returns boolean language sql stable as
  $$ select acl_allows(p, t) and (ec is null or not (p::text = any (string_to_array(coalesce(current_setting('app.denied_export', true), ''), ',')))) $$;
grant execute on function acl_item_ok(uuid, uuid, text) to athena_app;
drop policy acl_read on artifact;
create policy acl_read on artifact as restrictive for all
  using ((select acl_off()) or acl_item_ok(project_id, tracker_id, export_control))
  with check ((select acl_off()) or acl_item_ok(project_id, tracker_id, export_control));

-- Liens : visibles dès que la portée (projet, tracker) des deux extrémités l'est ; l'extrémité sous contrôle export n'apparaît que comme
-- « lien vers un item sous contrôle export » (sans clé, titre ni contenu). Les portées sont recopiées sur le lien : aucune sous-requête.
alter table artifact_link
  add column from_project_id uuid, add column from_tracker_id uuid, add column to_project_id uuid, add column to_tracker_id uuid;
update artifact_link l set from_project_id = f.project_id, from_tracker_id = f.tracker_id, to_project_id = t.project_id, to_tracker_id = t.tracker_id
  from artifact f, artifact t where f.id = l.from_artifact_id and t.id = l.to_artifact_id;
create function artifact_link_scopes() returns trigger language plpgsql as $$
begin
  select project_id, tracker_id into new.from_project_id, new.from_tracker_id from artifact where id = new.from_artifact_id;
  select project_id, tracker_id into new.to_project_id, new.to_tracker_id from artifact where id = new.to_artifact_id;
  return new;
end $$;
create trigger artifact_link_scopes before insert on artifact_link for each row execute function artifact_link_scopes();
drop policy acl_read on artifact_link;
create policy acl_read on artifact_link as restrictive for all
  using ((select acl_off()) or (acl_allows(from_project_id, from_tracker_id) and acl_allows(to_project_id, to_tracker_id)))
  with check ((select acl_off()) or (acl_allows(from_project_id, from_tracker_id) and acl_allows(to_project_id, to_tracker_id)));

-- Webhooks sortants : un abonnement ne reçoit les événements d'un item sous contrôle export que s'il est déclaré habilité.
alter table webhook_endpoint add column export_control_ok boolean not null default false;
