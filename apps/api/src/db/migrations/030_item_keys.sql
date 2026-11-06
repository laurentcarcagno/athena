-- 030 : clés d'item au format <PROJET>-<TRACKER>-<n sur 4 chiffres minimum> (ADR-0002 § 2).
-- Les anciennes clés (<TRACKER>-<n>) deviennent des alias, uniques dans leur projet.
create table artifact_key_alias (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  artifact_id uuid not null,
  project_id uuid not null,
  alias text not null check (alias ~ '^[A-Z][A-Z0-9]{1,9}-[0-9]{1,9}$'),
  created_at timestamptz not null default now(),
  foreign key (artifact_id, organization_id) references artifact(id, organization_id) on delete cascade,
  foreign key (project_id, organization_id) references project(id, organization_id),
  unique (project_id, alias)
);
create index artifact_key_alias_artifact on artifact_key_alias (artifact_id);
alter table artifact_key_alias enable row level security;
alter table artifact_key_alias force row level security;
create policy org_isolation on artifact_key_alias using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, delete on artifact_key_alias to athena_app;

-- Conservation des anciennes clés, puis réécriture.
insert into artifact_key_alias (organization_id, artifact_id, project_id, alias)
  select organization_id, id, project_id, key from artifact;

update artifact a
  set key = p.key || '-' || t.key || '-' || lpad(a.number::text, 4, '0')
  from project p, tracker t
  where p.id = a.project_id and t.id = a.tracker_id;

-- Les correspondances d'import pointent vers la clé : alignées sur la nouvelle (le journal d'automatisation garde l'ancienne, c'est un historique).
update import_map m set artifact_key = a.key
  from artifact_key_alias al join artifact a on a.id = al.artifact_id
  where al.project_id = m.project_id and al.alias = m.artifact_key;

alter table artifact add constraint artifact_org_key_unique unique (organization_id, key);
alter table artifact add constraint artifact_key_format check (key ~ '^[A-Z][A-Z0-9]{1,9}-[A-Z][A-Z0-9]{1,9}-[0-9]{4,9}$');

-- Résolution d'une clé (canonique, sinon alias) dans le contexte d'un projet ; la RLS de l'appelant s'applique.
create function resolve_artifact(p_project uuid, p_key text) returns uuid language sql stable as $$
  select coalesce(
    (select id from artifact where project_id = p_project and key = p_key),
    (select artifact_id from artifact_key_alias where project_id = p_project and alias = p_key))
$$;
grant execute on function resolve_artifact(uuid, text) to athena_app;

-- La clé de projet entre dans la clé des items : elle ne change plus dès qu'un item existe.
create function forbid_project_key_change() returns trigger language plpgsql as $$
begin
  if new.key is distinct from old.key and exists (select 1 from artifact where project_id = old.id) then
    raise exception 'la clé d''un projet ne peut plus changer une fois des items créés' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger project_key_immutable before update of key on project
  for each row execute function forbid_project_key_change();
