-- 086 : jetons d'acces personnels (plan § 7.3 et 14.1). Hachés (SHA-256), portée limitée, expiration obligatoire, révocables, visibles une seule fois.
-- Le profil de l'utilisateur (sujet, rôles, groupes) est figé à la création : un jeton ne gagne jamais de droits après coup.
create table personal_access_token (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  subject text not null,
  username text not null,
  display_name text,
  email text,
  roles text[] not null,
  groups text[] not null,
  name text not null check (char_length(name) between 1 and 100),
  scope text not null check (scope in ('read', 'write')),
  token_prefix text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at and expires_at <= created_at + interval '366 days')
);
create index personal_access_token_subject on personal_access_token (organization_id, subject, created_at desc);
alter table personal_access_token enable row level security;
alter table personal_access_token force row level security;
create policy org_isolation on personal_access_token using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update on personal_access_token to athena_app;

-- Authentification : la recherche se fait par empreinte, avant de connaître l'organisation. La fonction ne renvoie que les jetons valides
-- (ni révoqués ni expirés) et tient `last_used_at` à jour au plus une fois par minute.
create function authenticate_personal_access_token(p_hash text)
returns table (id uuid, organization_id uuid, subject text, username text, display_name text, email text, roles text[], groups text[], scope text)
language plpgsql security definer set search_path = public as $$
begin
  update personal_access_token t set last_used_at = now()
   where t.token_hash = p_hash and (t.last_used_at is null or t.last_used_at < now() - interval '1 minute') and t.revoked_at is null and t.expires_at > now();
  return query
    select t.id, t.organization_id, t.subject, t.username, t.display_name, t.email, t.roles, t.groups, t.scope
      from personal_access_token t where t.token_hash = p_hash and t.revoked_at is null and t.expires_at > now();
end $$;
revoke all on function authenticate_personal_access_token(text) from public;
grant execute on function authenticate_personal_access_token(text) to athena_app;
