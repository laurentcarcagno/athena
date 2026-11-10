import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db, type Actor } from './db';
import { conflict, notFound } from './errors';
import { audit } from './tracker.service';
import { CATEGORIES, TYPE_KEY, VIEWS, builtinTrackerTypes, type TrackerTypeView } from './tracker-types';

export const BaseFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().min(1).max(100),
  type: z.string().min(1).max(40),
  required: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  semanticRole: z.enum(['title', 'description', 'status', 'assignee', 'due_date', 'estimate', 'priority', 'version']).optional(),
});

export const TrackerTypeInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).default(''),
  category: z.enum(CATEGORIES),
  defaultViews: z.array(z.enum(VIEWS)).min(1).max(VIEWS.length),
  baseFields: z.array(BaseFieldSchema).max(50).default([]),
});
export type TrackerTypeInput = z.infer<typeof TrackerTypeInput>;

interface Row {
  key: string;
  name: string;
  description: string;
  category: TrackerTypeView['category'];
  default_views: TrackerTypeView['defaultViews'];
  base_fields: TrackerTypeView['baseFields'];
}

/** Types de tracker de l'organisation : types livrés (modifiables, réinitialisables) et types propres à l'organisation. */
export class TrackerTypeService {
  constructor(private readonly db: Db) {}

  async list(organizationId: string): Promise<TrackerTypeView[]> {
    const rows = (await this.db.tx(organizationId, (c) =>
      c.query('select key, name, description, category, default_views, base_fields from tracker_type order by key'))).rows as Row[];
    const view = (r: Row, builtin: boolean): TrackerTypeView => ({
      key: r.key, name: r.name, description: r.description, category: r.category,
      defaultViews: r.default_views, baseFields: r.base_fields, builtin, modified: builtin,
    });
    const stored = new Map(rows.map((r) => [r.key, r]));
    const builtins = builtinTrackerTypes();
    return [
      ...builtins.map((b) => (stored.has(b.key) ? view(stored.get(b.key)!, true) : b)),
      ...rows.filter((r) => !builtins.some((b) => b.key === r.key)).map((r) => view(r, false)),
    ];
  }

  async create(organizationId: string, key: string, input: TrackerTypeInput, actor: Actor): Promise<void> {
    if (!TYPE_KEY.test(key)) throw conflict('Clé de type invalide.');
    await this.db.tx(organizationId, async (c) => {
      const taken = builtinTrackerTypes().some((b) => b.key === key) || (await this.stored(c, key));
      if (taken) throw conflict(`Le type ${key} existe déjà.`);
      await this.write(c, organizationId, key, input, actor, true);
    });
  }

  /** Modifie un type ; pour un type livré, enregistre une version de l'organisation sous la même clé. */
  async update(organizationId: string, key: string, input: TrackerTypeInput, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const stored = await this.stored(c, key);
      if (!stored && !builtinTrackerTypes().some((b) => b.key === key)) throw notFound(`Type ${key}`);
      await this.write(c, organizationId, key, input, actor, !stored);
    });
  }

  /** Supprime un type de l'organisation ; pour un type livré modifié, rétablit sa version d'origine. Refusé s'il est utilisé. */
  async remove(organizationId: string, key: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const stored = await this.stored(c, key);
      const builtin = builtinTrackerTypes().some((b) => b.key === key);
      if (!stored && !builtin) throw notFound(`Type ${key}`);
      if (!stored) throw conflict(`Le type ${key} est livré avec Athena et n'a pas été modifié : rien à supprimer.`);
      if (!builtin) {
        const used = Number((await c.query('select count(*) n from tracker where type_key = $1', [key])).rows[0].n);
        if (used > 0) throw conflict(`Le type ${key} est utilisé par ${used} tracker(s).`);
      }
      await c.query('delete from tracker_type where key = $1', [key]);
      await audit(c, organizationId, actor, builtin ? 'tracker_type.reset' : 'tracker_type.delete', `tracker_type:${key}`);
    });
  }

  private async stored(c: PoolClient, key: string): Promise<boolean> {
    return ((await c.query('select 1 from tracker_type where key = $1', [key])).rowCount ?? 0) > 0;
  }

  private async write(c: PoolClient, org: string, key: string, input: TrackerTypeInput, actor: Actor, insert: boolean): Promise<void> {
    const values = [key, input.name, input.description, input.category, JSON.stringify(input.defaultViews), JSON.stringify(input.baseFields)];
    if (insert) {
      await c.query(
        'insert into tracker_type (organization_id, key, name, description, category, default_views, base_fields, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [org, ...values, actor.id],
      );
    } else {
      await c.query('update tracker_type set name = $2, description = $3, category = $4, default_views = $5, base_fields = $6, updated_at = now() where key = $1', values);
    }
    await audit(c, org, actor, insert ? 'tracker_type.create' : 'tracker_type.update', `tracker_type:${key}`);
  }
}
