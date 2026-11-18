-- 091 : besoin d'en connaître sur deux tables à portée de projet créées sans politique acl_read (test d'architecture RLS).
-- Un champ partagé propre à un projet (project_id non nul) n'est plus lisible par qui n'a pas accès au projet ; les champs d'organisation (project_id nul) restent visibles.
create policy acl_read on shared_field as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
create policy acl_read on history_sync_cursor as restrictive for all
  using ((select acl_off()) or acl_allows(project_id, null)) with check ((select acl_off()) or acl_allows(project_id, null));
