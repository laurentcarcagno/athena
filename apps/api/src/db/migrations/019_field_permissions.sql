-- 019 : permissions par champ (plan § 15.2). NULL = tout le monde ; le rôle athena-admin passe toujours.
alter table field_definition add column read_roles text[] check (read_roles is null or cardinality(read_roles) between 1 and 20);
alter table field_definition add column write_roles text[] check (write_roles is null or cardinality(write_roles) between 1 and 20);
