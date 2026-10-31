-- 010 : sessions web (BFF). Aucun jeton n'est stocké : seulement l'identité validée à la connexion.
-- L'identifiant de session n'est jamais stocké en clair (empreinte SHA-256).
create table web_session (
  id_hash text primary key,
  subject text not null,
  principal jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index web_session_expiry on web_session (expires_at);
create index web_session_subject on web_session (subject);
grant select, insert, delete on web_session to athena_app;
