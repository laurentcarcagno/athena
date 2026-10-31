-- 015 : suivi du traitement des hooks de plugins sur l'outbox.
alter table outbox_event add column plugin_hooks_processed_at timestamptz;
grant update (plugin_hooks_processed_at) on outbox_event to athena_app;
