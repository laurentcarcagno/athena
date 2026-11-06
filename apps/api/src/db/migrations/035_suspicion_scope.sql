-- 035 : portée de la suspicion de lien (ADR-0002, Lot 2). Un lien ne devient suspect que si un champ de contenu de sa cible change
-- (`is_content`, vrai par défaut : le comportement d'avant est conservé tant que rien n'est décoché), et seulement si son type
-- propage la suspicion (`propagates_suspect`, vrai par défaut ; désactivable, par exemple pour « bloque »).
alter table field_definition add column is_content boolean not null default true;
alter table link_type add column propagates_suspect boolean not null default true;
