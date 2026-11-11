-- 056 : teinte nommée d'un statut (ADR-0004, Lot 10, T-0138). Nulle = teinte de la catégorie (à faire, en cours, fait).
alter table status add column color text check (color in ('gray', 'slate', 'blue', 'sky', 'teal', 'green', 'lime', 'yellow', 'orange', 'red', 'pink', 'purple'));
