import { z } from 'zod';
import { Db } from './db';
import { notFound } from './errors';

export const PinEntry = z.object({
  kind: z.enum(['project', 'tracker', 'view', 'item']),
  project: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/),
  ref: z.string().min(1).max(120),
  label: z.string().min(1).max(160),
});
export type PinEntry = z.infer<typeof PinEntry>;

export interface PinView { id: string; kind: PinEntry['kind']; project: string; ref: string; label: string; favorite: boolean }

const RECENT_SHOWN = 8;
const RECENT_KEPT = 30;
const toView = (r: Record<string, unknown>): PinView => ({
  id: r['id'] as string, kind: r['kind'] as PinEntry['kind'], project: r['project_key'] as string, ref: r['ref'] as string, label: r['label'] as string, favorite: r['favorite'] as boolean,
});

/** Favoris (ordre libre) et récents (derniers éléments ouverts) de l'utilisateur ; chacun ne voit que les siens. */
export class PinService {
  constructor(private readonly db: Db) {}

  async list(organizationId: string, subject: string): Promise<{ favorites: PinView[]; recents: PinView[] }> {
    return this.db.tx(organizationId, async (c) => {
      const favorites = (await c.query('select * from user_pin where subject = $1 and favorite order by position, label', [subject])).rows.map(toView);
      const recents = (await c.query('select * from user_pin where subject = $1 and not favorite order by last_opened_at desc limit $2', [subject, RECENT_SHOWN])).rows.map(toView);
      return { favorites, recents };
    });
  }

  /** Note l'ouverture d'un élément (crée la ligne ou rafraîchit sa date), puis élague les plus anciens non épinglés. */
  async visit(organizationId: string, subject: string, entry: PinEntry): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      await c.query(
        `insert into user_pin (organization_id, subject, kind, project_key, ref, label) values ($1,$2,$3,$4,$5,$6)
         on conflict (organization_id, subject, kind, project_key, ref) do update set last_opened_at = now(), label = excluded.label`,
        [organizationId, subject, entry.kind, entry.project, entry.ref, entry.label],
      );
      await c.query(
        `delete from user_pin where subject = $1 and not favorite and id not in
           (select id from user_pin where subject = $1 and not favorite order by last_opened_at desc limit $2)`,
        [subject, RECENT_KEPT],
      );
    });
  }

  /** Épingle ou désépingle un élément ; un nouveau favori passe en dernière position. */
  async setFavorite(organizationId: string, subject: string, entry: PinEntry, favorite: boolean): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const position = Number((await c.query('select coalesce(max(position) + 1, 0) n from user_pin where subject = $1 and favorite', [subject])).rows[0].n);
      await c.query(
        `insert into user_pin (organization_id, subject, kind, project_key, ref, label, favorite, position) values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (organization_id, subject, kind, project_key, ref) do update
           set favorite = excluded.favorite, label = excluded.label, position = case when user_pin.favorite then user_pin.position else excluded.position end`,
        [organizationId, subject, entry.kind, entry.project, entry.ref, entry.label, favorite, position],
      );
    });
  }

  /** Réordonne les favoris : `ids` est l'ordre complet voulu ; un identifiant inconnu ou d'un autre utilisateur est refusé. */
  async reorder(organizationId: string, subject: string, ids: string[]): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const own = new Set((await c.query('select id from user_pin where subject = $1 and favorite', [subject])).rows.map((r) => r.id as string));
      for (const id of ids) if (!own.has(id)) throw notFound('Favori');
      for (const [position, id] of ids.entries()) await c.query('update user_pin set position = $2 where id = $1 and subject = $3', [id, position, subject]);
    });
  }
}
