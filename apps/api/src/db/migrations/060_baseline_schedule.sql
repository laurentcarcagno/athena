-- 060 : dates planifiées figées par une baseline (Lot 12, T-0164, ADR-0006 D2). Une ligne par ticket planifié du projet à l'instant
-- de la baseline (début nul pour un jalon) ; sert au calque en pointillés et à l'écart en jours du Gantt.
create table baseline_schedule (
  baseline_id uuid not null references baseline(id) on delete cascade,
  organization_id uuid not null references organization(id),
  artifact_key text not null,
  planned_start date,
  planned_end date not null,
  primary key (baseline_id, artifact_key)
);
alter table baseline_schedule enable row level security;
alter table baseline_schedule force row level security;
create policy org_isolation on baseline_schedule using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on baseline_schedule to athena_app;
