-- 032 : vues enregistrées d'un tracker (ADR-0002). Un filtre enregistré peut être rattaché à un tracker, porter une vue
-- (tableau, board…), des colonnes, et être la vue par défaut du tracker. Sans tracker, il reste un filtre de projet (page Recherche).
alter table saved_filter add column tracker_key text check (tracker_key is null or tracker_key ~ '^[A-Z][A-Z0-9]{1,9}$');
alter table saved_filter add column view text not null default 'tableau' check (view ~ '^[a-z][a-z0-9-]{0,39}$');
alter table saved_filter add column columns jsonb check (columns is null or jsonb_typeof(columns) = 'array');
alter table saved_filter add column is_default boolean not null default false;
alter table saved_filter add constraint saved_filter_default_scope check (not is_default or (tracker_key is not null and shared));
-- Une seule vue par défaut par tracker.
create unique index saved_filter_one_default on saved_filter (project_id, tracker_key) where is_default;
grant update on saved_filter to athena_app;
