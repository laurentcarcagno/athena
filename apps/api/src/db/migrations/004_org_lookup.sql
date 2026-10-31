-- 004 : résolution d'une organisation par sa clé, sans contexte RLS.
-- SECURITY DEFINER : la clé provient d'un groupe Keycloak validé par signature (jeton), pas de l'utilisateur.
create function organization_id_by_key(p_key text) returns uuid
  language sql stable security definer set search_path = public as
  $$ select id from organization where key = p_key $$;

revoke all on function organization_id_by_key(text) from public;
grant execute on function organization_id_by_key(text) to athena_app;
