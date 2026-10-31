-- 023 : règles d'automatisation planifiées (trigger_type = 'schedule').
alter table automation_rule add column schedule_minutes integer check (schedule_minutes is null or schedule_minutes between 5 and 10080);
alter table automation_rule add column last_run_at timestamptz;
