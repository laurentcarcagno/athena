-- 072 : portée « portfolio:<clé> » du tableau de bord (Lot 18, B24) : le tableau de bord d'un portefeuille a sa propre disposition.
alter table dashboard_layout drop constraint if exists dashboard_layout_scope_check;
alter table dashboard_layout add constraint dashboard_layout_scope_check
  check (scope = '' or scope ~ '^[A-Z][A-Z0-9]{1,9}(:avancement)?$' or scope ~ '^portfolio:[a-z0-9][a-z0-9-]{1,29}$');
