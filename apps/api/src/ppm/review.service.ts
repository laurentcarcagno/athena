import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { conflict, notFound } from '../core/errors';
import { audit } from '../core/tracker.service';
import type { SnapshotDetail, SnapshotService } from './snapshot.service';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), 'date invalide');
export const ReviewCreate = z.object({ heldOn: Day, summary: z.string().max(4000).default('') });
export const ReviewPatch = z.object({ summary: z.string().max(4000).optional(), state: z.enum(['draft', 'held']).optional() });

export interface ReviewView { id: string; heldOn: string; state: 'draft' | 'held'; summary: string; snapshotId: string; createdBy: string; createdAt: string }
/** Dossier de revue : la revue et l'instantané figé à sa création (jamais les données du jour). */
export interface ReviewDossier { review: ReviewView; portfolio: { key: string; name: string }; snapshot: SnapshotDetail }

/** Revues de portefeuille (lot 20, B33) : une revue fige un instantané ; son dossier relit uniquement cet instantané. */
export class ReviewService {
  constructor(private readonly db: Db, private readonly snapshots: Pick<SnapshotService, 'take' | 'get'>) {}

  private async portfolio(c: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }, key: string) {
    const p = (await c.query('select id, key, name from portfolio where key = $1', [key])).rows[0];
    if (!p) throw notFound(`Portefeuille ${key}`);
    return p as { id: string; key: string; name: string };
  }

  private view(r: any): ReviewView {
    return { id: r.id, heldOn: r.held_on, state: r.state, summary: r.summary, snapshotId: r.snapshot_id, createdBy: r.created_by, createdAt: new Date(r.created_at).toISOString() };
  }

  async list(organizationId: string, portfolioKey: string): Promise<ReviewView[]> {
    return this.db.tx(organizationId, async (c) => {
      const p = await this.portfolio(c, portfolioKey);
      return (await c.query(
        `select r.id, to_char(r.held_on, 'YYYY-MM-DD') held_on, r.state, r.summary, r.snapshot_id, coalesce(u.display_name, r.created_by) created_by, r.created_at
           from portfolio_review r left join user_account u on u.organization_id = r.organization_id and u.subject = r.created_by
          where r.portfolio_id = $1 order by r.held_on desc, r.created_at desc`, [p.id])).rows.map((r) => this.view(r));
    });
  }

  /** Crée la revue et prend l'instantané « revue » du moment : le dossier ne bougera plus. */
  async create(organizationId: string, portfolioKey: string, input: z.infer<typeof ReviewCreate>, actor: Actor): Promise<ReviewView> {
    const snap = await this.snapshots.take(organizationId, portfolioKey, { kind: 'review', label: `Revue du ${input.heldOn}` }, actor);
    return this.db.tx(organizationId, async (c) => {
      const p = await this.portfolio(c, portfolioKey);
      const row = (await c.query(
        `insert into portfolio_review (organization_id, portfolio_id, held_on, snapshot_id, summary, created_by) values ($1,$2,$3,$4,$5,$6) returning id`,
        [organizationId, p.id, input.heldOn, snap.id, input.summary, actor.id])).rows[0];
      await audit(c, organizationId, actor, 'portfolio.review.create', `portfolio:${portfolioKey}`, { heldOn: input.heldOn, snapshot: snap.id });
      const r = (await c.query(
        `select r.id, to_char(r.held_on, 'YYYY-MM-DD') held_on, r.state, r.summary, r.snapshot_id, r.created_by, r.created_at from portfolio_review r where r.id = $1`, [row.id])).rows[0];
      return this.view(r);
    }, { system: true });
  }

  /** Modifie le compte rendu ou la tenue ; une revue tenue n'est plus modifiable (pièce de gouvernance). */
  async update(organizationId: string, portfolioKey: string, id: string, patch: z.infer<typeof ReviewPatch>, actor: Actor): Promise<ReviewView> {
    return this.db.tx(organizationId, async (c) => {
      const p = await this.portfolio(c, portfolioKey);
      const r = (await c.query('select id, state from portfolio_review where id = $1 and portfolio_id = $2', [id, p.id])).rows[0];
      if (!r) throw notFound('Revue');
      if (r.state === 'held') throw conflict('Une revue tenue n’est plus modifiable.');
      await c.query('update portfolio_review set summary = coalesce($2, summary), state = coalesce($3, state) where id = $1', [id, patch.summary ?? null, patch.state ?? null]);
      await audit(c, organizationId, actor, 'portfolio.review.update', `portfolio:${portfolioKey}`, { id, state: patch.state ?? null });
      const out = (await c.query(
        `select r.id, to_char(r.held_on, 'YYYY-MM-DD') held_on, r.state, r.summary, r.snapshot_id, r.created_by, r.created_at from portfolio_review r where r.id = $1`, [id])).rows[0];
      return this.view(out);
    });
  }

  async dossier(organizationId: string, portfolioKey: string, id: string): Promise<ReviewDossier> {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound('Revue');
    const { review, portfolio } = await this.db.tx(organizationId, async (c) => {
      const p = await this.portfolio(c, portfolioKey);
      const r = (await c.query(
        `select r.id, to_char(r.held_on, 'YYYY-MM-DD') held_on, r.state, r.summary, r.snapshot_id, coalesce(u.display_name, r.created_by) created_by, r.created_at
           from portfolio_review r left join user_account u on u.organization_id = r.organization_id and u.subject = r.created_by where r.id = $1 and r.portfolio_id = $2`, [id, p.id])).rows[0];
      if (!r) throw notFound('Revue');
      return { review: this.view(r), portfolio: { key: p.key, name: p.name } };
    });
    return { review, portfolio, snapshot: await this.snapshots.get(organizationId, portfolioKey, review.snapshotId) };
  }
}
