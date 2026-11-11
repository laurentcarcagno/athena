-- 057 : cartes de tableau de bord organisables (ADR-0005, Lot 11, T-0153).
-- La portée accepte aussi la page Avancement d'un projet (« ARI:avancement ») ; chaque carte porte sa largeur (S, M, L, XL)
-- et ses réglages dans le JSON de la disposition (aucune colonne nouvelle).

alter table dashboard_layout drop constraint if exists dashboard_layout_scope_check;
alter table dashboard_layout add constraint dashboard_layout_scope_check
  check (scope = '' or scope ~ '^[A-Z][A-Z0-9]{1,9}(:avancement)?$');
