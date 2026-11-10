-- 051 : tableau de bord par portée (ADR-0003, Lot 9, T-0123).
-- '' = l'accueil personnel (Mon travail) ; une clé de projet = la Vue d'ensemble de ce projet, propre à chaque personne.

alter table dashboard_layout add column scope text not null default '' check (scope = '' or scope ~ '^[A-Z][A-Z0-9]{1,9}$');
alter table dashboard_layout drop constraint dashboard_layout_pkey;
alter table dashboard_layout add primary key (organization_id, owner, scope);
