-- 024 : mode d'écriture de l'historique par tracker. « merge_request » : les commits vont sur une branche de revue avec une merge request ouverte.
alter table tracker add column history_mode text not null default 'direct' check (history_mode in ('direct', 'merge_request'));
