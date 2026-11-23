-- 095 : densité Confortable (ADR-0004) : texte et contrôles plus grands, au choix de la personne.
alter table user_preference drop constraint if exists user_preference_density_check;
alter table user_preference add constraint user_preference_density_check check (density in ('normal', 'compact', 'comfortable'));
