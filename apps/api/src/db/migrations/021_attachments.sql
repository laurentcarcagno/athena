-- 021 : pièces jointes. Le contenu est dans S3/MinIO (clé opaque) ; la base garde les métadonnées et l'empreinte.
create table attachment (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id),
  artifact_id uuid not null references artifact(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_key text not null unique,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);
create index attachment_artifact on attachment (artifact_id, created_at);
alter table attachment enable row level security;
alter table attachment force row level security;
create policy org_isolation on attachment using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, delete on attachment to athena_app;
