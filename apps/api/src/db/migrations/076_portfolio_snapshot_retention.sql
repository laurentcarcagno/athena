-- 076 : rétention des instantanés propre à un portefeuille (Lot 20, étude PPM § 2.5) : nul = réglage de l'organisation.
alter table portfolio add column snapshot_weekly_retention_weeks integer check (snapshot_weekly_retention_weeks is null or snapshot_weekly_retention_weeks between 1 and 520);
alter table portfolio add column snapshot_review_retention_months integer check (snapshot_review_retention_months is null or snapshot_review_retention_months between 1 and 600);
