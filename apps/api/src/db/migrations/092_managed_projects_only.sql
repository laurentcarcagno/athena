-- 092 : un chef de projet ne voit que les projets dont il est responsable.
-- `app.only_projects` est une liste blanche posée en début de transaction (comme les refus des listes d'ayants droit) : « x » suivi des identifiants des projets dont le
-- sujet est `manager`. Vide ou absente : aucune restriction. Toutes les politiques passent par acl_off() et acl_allows(), qui la prennent en compte ; aucune politique
-- n'est à réécrire. La liste est calculée par l'application avant d'activer les politiques, ce qui évite toute récursion sur project_member.
create or replace function acl_off() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.denied_projects', true), '') = '' and coalesce(current_setting('app.denied_trackers', true), '') = ''
        and coalesce(current_setting('app.denied_export', true), '') = '' and coalesce(current_setting('app.only_projects', true), '') = '' $$;
create or replace function acl_allows(p uuid, t uuid) returns boolean language sql stable as
  $$ select (p is null or not (p::text = any (string_to_array(coalesce(current_setting('app.denied_projects', true), ''), ','))))
        and (t is null or not (t::text = any (string_to_array(coalesce(current_setting('app.denied_trackers', true), ''), ','))))
        and (p is null or coalesce(current_setting('app.only_projects', true), '') = ''
             or p::text = any (string_to_array(coalesce(current_setting('app.only_projects', true), ''), ','))) $$;
