-- 066 : réglages PPM de l'organisation (Lot 17, étude PPM § 03 modèle de données 2.5 et 2.9). Sans ligne, les valeurs par défaut
-- ci-dessous s'appliquent (`ppm/settings.service.ts`). La durée de la journée est stockée en minutes (entier, sans arrondi) :
-- 468 = 7 h 48, 420 = 7 h 00, 480 = 8 h 00.
create table organization_ppm_settings (
  organization_id uuid primary key references organization(id),
  workday_minutes integer not null default 468 check (workday_minutes between 1 and 1440),
  snapshot_frequency text not null default 'weekly' check (snapshot_frequency in ('weekly', 'monthly')),
  snapshot_weekly_retention_weeks integer not null default 26 check (snapshot_weekly_retention_weeks between 1 and 520),
  -- nul : instantanés de revue conservés sans limite (pièces de gouvernance)
  snapshot_review_retention_months integer check (snapshot_review_retention_months is null or snapshot_review_retention_months between 1 and 600),
  -- seuil de surcharge, en pourcentage de la capacité
  overload_percent integer not null default 110 check (overload_percent between 100 and 300),
  -- jours sans météo avant le rappel au chef de projet
  status_note_stale_days integer not null default 30 check (status_note_stale_days between 1 and 365),
  updated_by text not null,
  updated_at timestamptz not null default now()
);
alter table organization_ppm_settings enable row level security;
alter table organization_ppm_settings force row level security;
create policy org_isolation on organization_ppm_settings using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on organization_ppm_settings to athena_app;
