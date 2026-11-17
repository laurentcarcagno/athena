-- 073 : événement « weather » (Lot 18, B25) : rappel au chef de projet sans météo récente. Pas d'artefact : la notification mène au projet.
alter table notification drop constraint if exists notification_event_check;
alter table notification add constraint notification_event_check check (event in ('transition', 'mention', 'suspect', 'comment', 'approval', 'weather'));
alter table notification_pref drop constraint if exists notification_pref_event_check;
alter table notification_pref add constraint notification_pref_event_check check (event in ('transition', 'mention', 'suspect', 'comment', 'approval', 'weather'));
