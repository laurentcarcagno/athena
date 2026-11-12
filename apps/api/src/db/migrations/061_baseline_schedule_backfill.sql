-- 061 : planning des baselines antérieures à la migration 060 (Lot 12). Une baseline créée avant 060 n'a pas de dates figées ;
-- on les reconstitue à partir des révisions : pour chaque ticket des trackers qui portent un début et une échéance, les dates de sa
-- dernière révision au moment de la baseline. Ce sont les dates saisies alors (celles que la replanification écrit dans les tickets),
-- pas un recalcul. Les baselines qui ont déjà un planning figé, et les tickets sans échéance, sont laissés tels quels.
insert into baseline_schedule (baseline_id, organization_id, artifact_key, planned_start, planned_end)
select b.id, b.organization_id, a.key,
       case when rev.vals ->> fs.key is null then null else (rev.vals ->> fs.key)::date end,
       (rev.vals ->> fe.key)::date
from baseline b
join artifact a on a.project_id = b.project_id
join field_definition fs on fs.tracker_id = a.tracker_id and fs.semantic_role = 'start_date'
join field_definition fe on fe.tracker_id = a.tracker_id and fe.semantic_role = 'due_date'
join lateral (
  select r.snapshot -> 'values' as vals
  from artifact_revision r
  where r.artifact_id = a.id and r.snapshot is not null and r.created_at <= b.created_at
  order by r.version desc limit 1
) rev on true
where not exists (select 1 from baseline_schedule x where x.baseline_id = b.id)
  and rev.vals ->> fe.key ~ '^\d{4}-\d{2}-\d{2}$'
  and (rev.vals ->> fs.key is null or rev.vals ->> fs.key ~ '^\d{4}-\d{2}-\d{2}$')
on conflict do nothing;
