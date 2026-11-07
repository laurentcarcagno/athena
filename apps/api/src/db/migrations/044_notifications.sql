-- 044 : notifications et abonnements (ADR-0002, Lot 7, T-0091).
-- Un abonnement porte sur un item, un tracker ou une vue enregistrée. Une notification est destinée à une personne ; les droits
-- (listes d'ayants droit, contrôle export) sont vérifiés deux fois : à la génération (le destinataire doit pouvoir lire l'item)
-- et à la lecture (politique restrictive sur l'item référencé). Une notification ne contient jamais de valeur de champ.

create table subscription (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  subject text not null check (char_length(subject) between 1 and 200),
  scope text not null check (scope in ('item', 'tracker', 'view')),
  project_id uuid not null,
  artifact_id uuid references artifact(id) on delete cascade,
  tracker_id uuid,
  filter_id uuid references saved_filter(id) on delete cascade,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references project(id, organization_id) on delete cascade,
  foreign key (tracker_id, organization_id) references tracker(id, organization_id) on delete cascade,
  check ((scope = 'item' and artifact_id is not null and tracker_id is null and filter_id is null)
      or (scope = 'tracker' and tracker_id is not null and artifact_id is null and filter_id is null)
      or (scope = 'view' and filter_id is not null and artifact_id is null and tracker_id is null))
);
create unique index subscription_item on subscription (subject, artifact_id) where scope = 'item';
create unique index subscription_tracker on subscription (subject, tracker_id) where scope = 'tracker';
create unique index subscription_view on subscription (subject, filter_id) where scope = 'view';
create index subscription_artifact on subscription (artifact_id) where scope = 'item';
create index subscription_tracker_lookup on subscription (tracker_id) where scope = 'tracker';
create index subscription_project_views on subscription (project_id) where scope = 'view';

create table notification (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  recipient text not null check (char_length(recipient) between 1 and 200),
  event text not null check (event in ('transition', 'mention', 'suspect', 'comment', 'approval')),
  project_id uuid not null,
  artifact_id uuid references artifact(id) on delete cascade,
  actor text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (project_id, organization_id) references project(id, organization_id) on delete cascade
);
create index notification_inbox on notification (recipient, created_at desc);
create index notification_unread on notification (recipient) where read_at is null;

-- Réglage par événement : absent = activé.
create table notification_pref (
  organization_id uuid not null references organization(id),
  subject text not null check (char_length(subject) between 1 and 200),
  event text not null check (event in ('transition', 'mention', 'suspect', 'comment', 'approval')),
  enabled boolean not null,
  primary key (organization_id, subject, event)
);

-- Le destinataire peut-il lire l'item ? Même règle que les politiques de lecture (liste d'ayants droit du projet ou du tracker,
-- contrôle export), évaluée pour un sujet quelconque. Les administrateurs d'organisation ne sont pas exemptés.
create function notify_can_see(s text, a uuid) returns boolean language sql stable set search_path = public as
  $$ select exists (
       select 1 from artifact x where x.id = a
         and not exists (select 1 from access_list l
                         where l.project_id = x.project_id and (l.tracker_id is null or l.tracker_id = x.tracker_id)
                           and not exists (select 1 from access_list_member m where m.access_list_id = l.id and m.subject = s))
         and (x.export_control is null
              or exists (select 1 from export_control_member m where m.project_id = x.project_id and m.subject = s))
     ) $$;
grant execute on function notify_can_see(text, uuid) to athena_app;

alter table subscription enable row level security;
alter table subscription force row level security;
create policy org_isolation on subscription using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on subscription as restrictive for all
  using ((select acl_off()) or (acl_allows(project_id, tracker_id) and (artifact_id is null or acl_artifact_ok(artifact_id))))
  with check ((select acl_off()) or (acl_allows(project_id, tracker_id) and (artifact_id is null or acl_artifact_ok(artifact_id))));

alter table notification enable row level security;
alter table notification force row level security;
create policy org_isolation on notification using (organization_id = current_org()) with check (organization_id = current_org());
create policy acl_read on notification as restrictive for all
  using ((select acl_off()) or (acl_allows(project_id, null) and (artifact_id is null or acl_artifact_ok(artifact_id))))
  with check ((select acl_off()) or (acl_allows(project_id, null) and (artifact_id is null or acl_artifact_ok(artifact_id))));

alter table notification_pref enable row level security;
alter table notification_pref force row level security;
create policy org_isolation on notification_pref using (organization_id = current_org()) with check (organization_id = current_org());

grant select, insert, update, delete on subscription, notification, notification_pref to athena_app;
