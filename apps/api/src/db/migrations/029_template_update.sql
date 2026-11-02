-- 029 : les templates (de projet et de tracker) sont modifiables ; modifier un template livré enregistre une version de l'organisation sous la même clé.
alter table project_template add column updated_at timestamptz;
alter table tracker_template add column updated_at timestamptz;
grant update on project_template to athena_app;
grant update on tracker_template to athena_app;
