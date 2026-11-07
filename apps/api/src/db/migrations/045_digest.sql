-- 045 : résumé quotidien par courriel (ADR-0002, Lot 7, T-0092).
-- Réglage par personne : activé ou non (désactivé par défaut), heure locale d'envoi, fuseau, langue. `last_sent_at` évite le double envoi.
-- `notification.digested_at` marque les notifications déjà reprises dans un résumé.
create table notification_digest (
  organization_id uuid not null references organization(id),
  subject text not null check (char_length(subject) between 1 and 200),
  enabled boolean not null default false,
  hour smallint not null default 8 check (hour between 0 and 23),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  locale text not null default 'fr' check (locale in ('fr', 'en')),
  last_sent_at timestamptz,
  primary key (organization_id, subject)
);
alter table notification_digest enable row level security;
alter table notification_digest force row level security;
create policy org_isolation on notification_digest using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on notification_digest to athena_app;

alter table notification add column digested_at timestamptz;
create index notification_undigested on notification (recipient) where digested_at is null and read_at is null;
