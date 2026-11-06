-- 042 : complément des listes d'ayants droit (039) : le journal des exécutions d'automatisation cite des clés d'items ; il suit la portée de sa règle.
create policy acl_read on automation_run as restrictive for all
  using ((select acl_off()) or exists (select 1 from automation_rule r where r.id = automation_run.rule_id))
  with check ((select acl_off()) or exists (select 1 from automation_rule r where r.id = automation_run.rule_id));
