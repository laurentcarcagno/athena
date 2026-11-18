-- 093 : classeur à onglets pour les tableaux de bord.
-- Chaque portée (accueil, projet, avancement, portefeuille) garde son onglet principal (tab = '') et peut recevoir des onglets
-- nommés, chacun avec sa propre disposition. L'onglet principal se renomme aussi. `dashboard_tab` liste les onglets nommés d'une personne pour une portée.

alter table dashboard_layout add column tab text not null default '' check (tab = '' or tab ~ '^[a-z0-9][a-z0-9-]{0,29}$');
alter table dashboard_layout drop constraint dashboard_layout_pkey;
alter table dashboard_layout add primary key (organization_id, owner, scope, tab);

create table dashboard_tab (
  organization_id uuid not null references organization(id),
  owner text not null,
  scope text not null,
  id text not null check (id = '' or id ~ '^[a-z0-9][a-z0-9-]{0,29}$'), -- '' : le titre de l'onglet principal, s'il a été renommé
  title text not null check (length(title) between 1 and 60),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (organization_id, owner, scope, id)
);

alter table dashboard_tab enable row level security;
alter table dashboard_tab force row level security;
create policy org_isolation on dashboard_tab using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on dashboard_tab to athena_app;
