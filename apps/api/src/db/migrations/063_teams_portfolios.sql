-- 063 : équipes et portefeuilles (Lot 16, ADR-0008). Une équipe regroupe des personnes (comptes connus) ; son manager voit leur charge.
-- Un portefeuille regroupe des projets ; le directeur lit sa synthèse (santé, avancement, retards, charge). La santé d'un projet
-- est calculée (bloqués et retards) ; la personne qui pilote le portefeuille peut la forcer et l'accompagner d'une note.
create table team (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,29}$'),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);
create table team_member (
  organization_id uuid not null references organization(id),
  team_id uuid not null references team(id) on delete cascade,
  subject text not null,
  role text not null check (role in ('manager', 'member')),
  added_by text not null,
  created_at timestamptz not null default now(),
  primary key (team_id, subject)
);
create index team_member_subject on team_member (organization_id, subject);

create table portfolio (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  key text not null check (key ~ '^[a-z0-9][a-z0-9-]{1,29}$'),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  owner_subject text,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);
create table portfolio_project (
  organization_id uuid not null references organization(id),
  portfolio_id uuid not null references portfolio(id) on delete cascade,
  project_id uuid not null references project(id) on delete cascade,
  position integer not null default 0,
  health_override text check (health_override in ('ok', 'attention', 'critical')),
  note text not null default '' check (char_length(note) <= 500),
  added_by text not null,
  created_at timestamptz not null default now(),
  primary key (portfolio_id, project_id)
);

do $$
declare t text;
begin
  foreach t in array array['team', 'team_member', 'portfolio', 'portfolio_project'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy org_isolation on %I using (organization_id = current_org()) with check (organization_id = current_org())', t);
    execute format('grant select, insert, update, delete on %I to athena_app', t);
  end loop;
end $$;
