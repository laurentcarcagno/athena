import { checkBrandImage, type BrandContentType } from './brand-image';
import { Db } from './db';
import { notFound, validation } from './errors';

/** Stockage d'objets minimal (S3/MinIO en service, mémoire en test). */
export interface ObjectStore {
  put(key: string, body: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export type BrandKind = 'mark' | 'logo';
export interface BrandEntry { theme: string; kind: BrandKind; contentType: BrandContentType; size: number; updatedAt: string }
/** `*` : l'image vaut pour tous les thèmes, sauf ceux qui ont la leur. */
const THEME = /^(\*|[a-z][a-z0-9-]{1,30})$/;
const check = (theme: string, kind: string): BrandKind => {
  if (!THEME.test(theme)) throw validation(['Thème invalide.']);
  if (kind !== 'mark' && kind !== 'logo') throw validation(['Type d’image invalide (mark ou logo).']);
  return kind;
};

/** Icône et logo de marque de l'organisation, par thème (ADR-0004, T-0137). */
export class BrandService {
  constructor(private readonly db: Db, private readonly store: ObjectStore) {}

  async list(organizationId: string): Promise<BrandEntry[]> {
    const rows = await this.db.tx(organizationId, async (c) => (await c.query('select theme, kind, content_type, size, updated_at from organization_brand order by theme, kind')).rows);
    return rows.map((r) => ({ theme: r.theme, kind: r.kind, contentType: r.content_type, size: r.size, updatedAt: new Date(r.updated_at).toISOString() }));
  }

  async put(organizationId: string, theme: string, kind: string, raw: Buffer): Promise<BrandEntry> {
    const k = check(theme, kind);
    const { contentType, data } = checkBrandImage(raw);
    const key = `brand/${organizationId}/${theme === '*' ? 'all' : theme}/${k}`;
    await this.store.put(key, data, contentType);
    const row = await this.db.tx(organizationId, async (c) => (await c.query(
      `insert into organization_brand (organization_id, theme, kind, content_type, storage_key, size) values ($1,$2,$3,$4,$5,$6)
       on conflict (organization_id, theme, kind) do update set content_type = excluded.content_type, storage_key = excluded.storage_key, size = excluded.size, updated_at = now()
       returning updated_at`, [organizationId, theme, k, contentType, key, data.length])).rows[0]);
    return { theme, kind: k, contentType, size: data.length, updatedAt: new Date(row.updated_at).toISOString() };
  }

  /** Image d'un thème : la sienne, sinon celle de tous les thèmes. */
  async read(organizationId: string, theme: string, kind: string): Promise<{ contentType: BrandContentType; data: Buffer }> {
    const k = check(theme, kind);
    const row = await this.db.tx(organizationId, async (c) => (await c.query(
      `select content_type, storage_key from organization_brand where kind = $1 and theme in ($2, '*') order by (theme = '*') limit 1`, [k, theme])).rows[0]);
    const data = row ? await this.store.get(row.storage_key) : null;
    if (!row || !data) throw notFound('Image de marque');
    return { contentType: row.content_type, data };
  }

  async remove(organizationId: string, theme: string, kind: string): Promise<void> {
    const k = check(theme, kind);
    const row = await this.db.tx(organizationId, async (c) => (await c.query('delete from organization_brand where theme = $1 and kind = $2 returning storage_key', [theme, k])).rows[0]);
    if (row) await this.store.delete(row.storage_key);
  }
}
