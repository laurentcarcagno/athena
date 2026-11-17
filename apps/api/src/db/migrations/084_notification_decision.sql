-- 084 : événement « decision » (Lot 24, B38) : notification au responsable d'une décision de portefeuille à son échéance.
alter table notification drop constraint if exists notification_event_check;
alter table notification add constraint notification_event_check check (event in ('transition', 'mention', 'suspect', 'comment', 'approval', 'weather', 'decision'));
alter table notification_pref drop constraint if exists notification_pref_event_check;
alter table notification_pref add constraint notification_pref_event_check check (event in ('transition', 'mention', 'suspect', 'comment', 'approval', 'weather', 'decision'));
