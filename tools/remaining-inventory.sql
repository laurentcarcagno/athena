select p.key project, t.key tracker, f.key field, f.type, count(a.id) tickets, count(a."values"->>f.key) valued,
  min((a."values"->>f.key)::numeric) mn, max((a."values"->>f.key)::numeric) mx, round(avg((a."values"->>f.key)::numeric),1) avg,
  count(*) filter (where (a."values"->>f.key)::numeric <> floor((a."values"->>f.key)::numeric)) fractional
from field_definition f join tracker t on t.id=f.tracker_id join project p on p.id=t.project_id left join artifact a on a.tracker_id=t.id
where f.semantic_role='remaining' group by 1,2,3,4 order by 1,2;
