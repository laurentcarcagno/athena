import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import type { TemplateService } from '../core/template.service';
import { audit } from '../core/tracker.service';

export const ConvertInput = z.object({
  project: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/), name: z.string().trim().min(1).max(100), template: z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/).optional(),
  version: z.string().regex(/^[0-9]+(\.[0-9]+)?$/).optional(), criticality: z.string().max(20).optional(),
});
export const RefuseInput = z.object({ reason: z.string().trim().min(1).max(2000) });
export interface RequestDecision { ticket: string; outcome: 'converted' | 'refused'; project: string | null; template: string | null; reason: string }

/**
 * Demandes (lot 25, B41) : un ticket d'un tracker de type « request » est converti en projet depuis un gabarit (la demande reste liée au projet créé) ou refusé avec un motif
 * obligatoire. La décision est unique et tracée (audit et historique de la demande).
 */
export class RequestService {
  constructor(private readonly db: Db, private readonly templates: Pick<TemplateService, 'createProject'>) {}

  private async request(c: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }, ticket: string) {
    const r = (await c.query(
      `select a.id, a.key, (select outcome from request_conversion x where x.artifact_id = a.id) outcome from project p join artifact a on a.id = resolve_artifact(p.id, $1) join tracker t on t.id = a.tracker_id
        where p.key = $2 and t.type_key = 'request'`, [ticket, ticket.split('-')[0]])).rows[0];
    if (!r) throw notFound(`Demande ${ticket}`);
    if (r.outcome) throw conflict(`La demande ${r.key} est déjà ${r.outcome === 'converted' ? 'convertie' : 'refusée'}.`);
    return r as { id: string; key: string };
  }

  async convert(organizationId: string, ticket: string, input: z.infer<typeof ConvertInput>, actor: Actor): Promise<RequestDecision> {
    const req = await this.db.tx(organizationId, (c) => this.request(c, ticket));
    await this.templates.createProject(organizationId, input.project, input.name, input.template, actor, { ...(input.version ? { version: input.version } : {}), ...(input.criticality ? { criticality: input.criticality } : {}) });
    await this.db.tx(organizationId, async (c) => {
      const p = (await c.query('select id from project where key = $1', [input.project])).rows[0];
      if (!p) throw validation([`le projet ${input.project} n’a pas été créé`]);
      await c.query("insert into request_conversion (artifact_id, organization_id, outcome, project_id, template_key, decided_by) values ($1,$2,'converted',$3,$4,$5)", [req.id, organizationId, p.id, input.template ?? null, actor.id]);
      await audit(c, organizationId, actor, 'request.convert', `request:${req.key}`, { project: input.project, template: input.template ?? null });
    });
    return { ticket: req.key, outcome: 'converted', project: input.project, template: input.template ?? null, reason: '' };
  }

  async refuse(organizationId: string, ticket: string, input: z.infer<typeof RefuseInput>, actor: Actor): Promise<RequestDecision> {
    return this.db.tx(organizationId, async (c) => {
      const req = await this.request(c, ticket);
      await c.query("insert into request_conversion (artifact_id, organization_id, outcome, reason, decided_by) values ($1,$2,'refused',$3,$4)", [req.id, organizationId, input.reason, actor.id]);
      await audit(c, organizationId, actor, 'request.refuse', `request:${req.key}`, { reason: input.reason });
      return { ticket: req.key, outcome: 'refused', project: null, template: null, reason: input.reason };
    });
  }
}
