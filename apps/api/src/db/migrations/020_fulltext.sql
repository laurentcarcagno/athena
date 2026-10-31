-- 020 : recherche plein texte sur toutes les valeurs textuelles d'un artefact (colonne générée + index GIN).
alter table artifact add column search_tsv tsvector
  generated always as (jsonb_to_tsvector('simple'::regconfig, "values", '["string"]'::jsonb)) stored;
create index artifact_search_tsv on artifact using gin (search_tsv);
