-- 087 : compteurs de limitation de debit partages entre instances d'API (plan § 13.3), sans Redis. Donnees techniques, hors organisation : pas de RLS.
-- UNLOGGED : perdus au redemarrage de la base, sans consequence (fenetres d'une minute).
create unlogged table rate_limit_window (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);
grant select, insert, update, delete on rate_limit_window to athena_app;
