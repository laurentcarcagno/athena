-- 053 : densité de l'interface sur le compte (ADR-0004, Lot 10, T-0135). Normale ou compacte ; nulle = réglage du navigateur.
alter table user_preference add column density text check (density in ('normal', 'compact'));
