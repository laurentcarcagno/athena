-- 055 : icône et logo de marque par thème (ADR-0004, Lot 10, T-0137). theme = '*' : vaut pour tous les thèmes.
-- L'image est dans le stockage d'objets ; seule une image vérifiée (PNG, WebP, SVG reconstruit, 64 Ko au plus) est enregistrée.
create table organization_brand (
  organization_id uuid not null references organization(id),
  theme text not null check (theme ~ '^(\*|[a-z][a-z0-9-]{1,30})$'),
  kind text not null check (kind in ('mark', 'logo')),
  content_type text not null check (content_type in ('image/png', 'image/webp', 'image/svg+xml')),
  storage_key text not null,
  size integer not null check (size > 0 and size <= 65536),
  updated_at timestamptz not null default now(),
  primary key (organization_id, theme, kind)
);

alter table organization_brand enable row level security;
alter table organization_brand force row level security;
create policy org_isolation on organization_brand using (organization_id = current_org()) with check (organization_id = current_org());
grant select, insert, update, delete on organization_brand to athena_app;
