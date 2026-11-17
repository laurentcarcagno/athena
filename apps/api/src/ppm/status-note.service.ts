import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { notFound } from '../core/errors';
import { audit } from '../core/tracker.service';

export const LEVELS = ['ok', 'attention', 'critical'] as const;
export type Level = (typeof LEVELS)[number];
const Lvl = z.enum(LEVELS);

/** Une météo : délai, périmètre et risque sont obligatoires ; ressources et coût restent facultatifs tant que les données V2 n'existent pas. */
export const StatusNoteInput = z.object({
  schedule: Lvl, scope: Lvl, risk: Lvl,
  resources: Lvl.nullable().optional(), cost: Lvl.nullable().optional(),
  comment: z.string().trim().max(2000).default(''),
});
export type StatusNoteData = z.infer<typeof StatusNoteInput>;

export interface StatusNote {
  id: string; writtenAt: string; author: string; authorName: string | null;
  schedule: Level; scope: Level; risk: Level; resources: Level | null; cost: Level | null; comment: string;
}

/** Pire niveau d'une météo (critique > attention > ok), sur les axes renseignés. */
export const worstLevel = (n: Pick<StatusNote, 'schedule' | 'scope' | 'risk' | 'resources' | 'cost'>): Level =>
  [n.schedule, n.scope, n.risk, n.resources, n.cost].reduce<Level>((w, l) => (l && LEVELS.indexOf(l) > LEVELS.indexOf(w) ? l : w), 'ok');

/** Météo du projet : ajout seul, la dernière note fait foi. Le droit d'écriture est vérifié par l'appelant (`requireManager`). */
export class StatusNoteService {
  constructor(private readonly db: Db) {}

  /** Notes du projet, de la plus récente à la plus ancienne. */
  async list(organizationId: string, projectKey: string, limit = 20): Promise<StatusNote[]> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const rows = (await c.query(
        `select n.id, n.written_at, n.author, u.display_name, n.schedule, n.scope, n.risk, n.resources, n.cost, n.comment
           from project_status_note n left join user_account u on u.organization_id = n.organization_id and u.subject = n.author
          where n.project_id = $1 order by n.written_at desc, n.id desc limit $2`, [project.id, Math.min(Math.max(limit, 1), 200)])).rows;
      return rows.map((r) => ({
        id: r.id, writtenAt: new Date(r.written_at).toISOString(), author: r.author, authorName: r.display_name ?? null,
        schedule: r.schedule, scope: r.scope, risk: r.risk, resources: r.resources, cost: r.cost, comment: r.comment,
      }));
    });
  }

  async write(organizationId: string, projectKey: string, input: StatusNoteData, actor: Actor): Promise<StatusNote> {
    const id = await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const row = (await c.query(
        `insert into project_status_note (organization_id, project_id, author, schedule, scope, risk, resources, cost, comment) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [organizationId, project.id, actor.id, input.schedule, input.scope, input.risk, input.resources ?? null, input.cost ?? null, input.comment])).rows[0];
      await audit(c, organizationId, actor, 'project.status_note', `project:${projectKey}`, { schedule: input.schedule, scope: input.scope, risk: input.risk });
      return row.id as string;
    });
    return (await this.list(organizationId, projectKey, 1)).find((n) => n.id === id)!;
  }
}
