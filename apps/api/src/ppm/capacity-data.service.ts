import { z } from 'zod';
import { Db, type Actor } from '../core/db';
import { forbidden, notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), 'date invalide');
const Subject = z.string().trim().min(1).max(200);

export const AvailabilityInput = z.object({ subject: Subject, from: Day, to: Day.nullable().default(null), ratio: z.number().gt(0).max(1), workdayMinutes: z.number().int().min(1).max(1440).nullable().default(null) });
export const AbsenceInput = z.object({ subject: Subject, from: Day, to: Day, kind: z.enum(['leave', 'training', 'other']).default('leave'), halfDay: z.boolean().default(false) });
export const AllocationInput = z.object({
  project: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/), subject: Subject.optional(), team: z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/).optional(), roleLabel: z.string().trim().min(1).max(100).optional(),
  from: Day, to: Day.nullable().default(null), fte: z.number().gt(0).max(20),
});
export type AvailabilityData = z.infer<typeof AvailabilityInput>;
export type AbsenceData = z.infer<typeof AbsenceInput>;
export type AllocationData = z.infer<typeof AllocationInput>;

export interface AvailabilityView { id: string; subject: string; from: string; to: string | null; ratio: number; workdayMinutes: number | null }
export interface AbsenceView { id: string; subject: string; from: string; to: string; halfDay: boolean; kind: string | null }
export interface AllocationView { id: string; project: string; subject: string | null; team: string | null; roleLabel: string | null; from: string; to: string | null; fte: number }

const FULL = ['athena-admin'];
const SEES_ALL = ['athena-admin', 'athena-pmo', 'athena-director'];
type Client = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/**
 * Saisie de la capacité (lot 21, B35) : disponibilité, absences, allocations. Droits : une personne voit et saisit ses absences ; un manager voit et
 * saisit pour les membres de ses équipes ; le PMO et la direction lisent tout, sans le motif des absences ; l'administrateur fait tout ; le chef d'un
 * projet saisit les allocations de ce projet.
 */
export class CapacityDataService {
  constructor(private readonly db: Db) {}

  /** La personne est-elle membre d'une équipe que l'acteur dirige ? */
  private async manages(c: Client, actor: Actor, subject: string): Promise<boolean> {
    return (await c.query(
      `select 1 from team_member a join team_member b on b.team_id = a.team_id where a.subject = $1 and a.role = 'manager' and b.subject = $2`, [actor.id, subject])).rows.length > 0;
  }

  async canSee(c: Client, actor: Actor, subject: string): Promise<boolean> {
    return actor.id === subject || SEES_ALL.some((r) => actor.roles.includes(r)) || await this.manages(c, actor, subject);
  }

  private async requireWrite(c: Client, actor: Actor, subject: string, selfAllowed: boolean): Promise<void> {
    if (FULL.some((r) => actor.roles.includes(r))) return;
    if (selfAllowed && actor.id === subject) return;
    if (await this.manages(c, actor, subject)) return;
    throw forbidden('Vous ne pouvez saisir que pour vous-même ou pour les membres de vos équipes.');
  }

  private async requireKnown(c: Client, subject: string): Promise<void> {
    if (!(await c.query('select 1 from user_account where subject = $1', [subject])).rows[0]) throw validation([`subject : compte inconnu (${subject})`]);
  }

  async listAvailability(organizationId: string, subject: string, actor: Actor): Promise<AvailabilityView[]> {
    return this.db.tx(organizationId, async (c) => {
      if (!(await this.canSee(c, actor, subject))) throw forbidden('Vous ne voyez pas la disponibilité de cette personne.');
      return (await c.query(
        `select id, subject, to_char(from_day, 'YYYY-MM-DD') f, to_char(to_day, 'YYYY-MM-DD') t, ratio::float r, workday_minutes w from person_availability where subject = $1 order by from_day, created_at`, [subject]))
        .rows.map((r) => ({ id: r.id, subject: r.subject, from: r.f, to: r.t, ratio: r.r, workdayMinutes: r.w }));
    });
  }

  async addAvailability(organizationId: string, input: AvailabilityData, actor: Actor): Promise<AvailabilityView> {
    return this.db.tx(organizationId, async (c) => {
      await this.requireWrite(c, actor, input.subject, false);
      await this.requireKnown(c, input.subject);
      if (input.to && input.to < input.from) throw validation(['to : la fin précède le début']);
      const row = (await c.query('insert into person_availability (organization_id, subject, from_day, to_day, ratio, workday_minutes, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id',
        [organizationId, input.subject, input.from, input.to, input.ratio, input.workdayMinutes, actor.id])).rows[0];
      await audit(c, organizationId, actor, 'capacity.availability', `person:${input.subject}`, { from: input.from, ratio: input.ratio });
      return { id: row.id, subject: input.subject, from: input.from, to: input.to, ratio: input.ratio, workdayMinutes: input.workdayMinutes };
    });
  }

  async removeAvailability(organizationId: string, id: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const r = (await c.query('select subject from person_availability where id = $1', [id])).rows[0];
      if (!r) throw notFound('Disponibilité');
      await this.requireWrite(c, actor, r.subject, false);
      await c.query('delete from person_availability where id = $1', [id]);
      await audit(c, organizationId, actor, 'capacity.availability.remove', `person:${r.subject}`, { id });
    });
  }

  /** Absences d'une personne ; le motif n'est rendu qu'à elle, à son manager et à l'administrateur. */
  async listAbsences(organizationId: string, subject: string, actor: Actor): Promise<AbsenceView[]> {
    return this.db.tx(organizationId, async (c) => {
      if (!(await this.canSee(c, actor, subject))) throw forbidden('Vous ne voyez pas les absences de cette personne.');
      const showKind = actor.id === subject || FULL.some((r) => actor.roles.includes(r)) || await this.manages(c, actor, subject);
      return (await c.query(`select id, subject, to_char(from_day, 'YYYY-MM-DD') f, to_char(to_day, 'YYYY-MM-DD') t, half_day h, kind from absence where subject = $1 order by from_day`, [subject]))
        .rows.map((r) => ({ id: r.id, subject: r.subject, from: r.f, to: r.t, halfDay: r.h, kind: showKind ? r.kind : null }));
    });
  }

  async addAbsence(organizationId: string, input: AbsenceData, actor: Actor): Promise<AbsenceView> {
    return this.db.tx(organizationId, async (c) => {
      await this.requireWrite(c, actor, input.subject, true);
      await this.requireKnown(c, input.subject);
      if (input.to < input.from) throw validation(['to : la fin précède le début']);
      if (input.halfDay && input.from !== input.to) throw validation(['halfDay : une demi-journée tient sur un seul jour']);
      const row = (await c.query('insert into absence (organization_id, subject, from_day, to_day, kind, half_day, created_by) values ($1,$2,$3,$4,$5,$6,$7) returning id',
        [organizationId, input.subject, input.from, input.to, input.kind, input.halfDay, actor.id])).rows[0];
      await audit(c, organizationId, actor, 'capacity.absence', `person:${input.subject}`, { from: input.from, to: input.to, halfDay: input.halfDay });
      return { id: row.id, subject: input.subject, from: input.from, to: input.to, halfDay: input.halfDay, kind: input.kind };
    });
  }

  async removeAbsence(organizationId: string, id: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const r = (await c.query('select subject from absence where id = $1', [id])).rows[0];
      if (!r) throw notFound('Absence');
      await this.requireWrite(c, actor, r.subject, true);
      await c.query('delete from absence where id = $1', [id]);
      await audit(c, organizationId, actor, 'capacity.absence.remove', `person:${r.subject}`, { id });
    });
  }

  async listAllocations(organizationId: string, projectKey: string): Promise<AllocationView[]> {
    return this.db.tx(organizationId, async (c) => (await c.query(
      `select a.id, p.key project, a.subject, t.key team, a.role_label, to_char(a.from_day, 'YYYY-MM-DD') f, to_char(a.to_day, 'YYYY-MM-DD') e, a.fte::float fte
         from allocation a join project p on p.id = a.project_id left join team t on t.id = a.team_id where p.key = $1 order by a.from_day, a.created_at`, [projectKey]))
      .rows.map((r) => ({ id: r.id, project: r.project, subject: r.subject, team: r.team, roleLabel: r.role_label, from: r.f, to: r.e, fte: r.fte })));
  }

  /** Alloue une personne (nominative) ou un besoin générique (équipe et rôle) à un projet. Le droit « chef du projet » est vérifié par l'appelant (`requireManager`). */
  async addAllocation(organizationId: string, input: AllocationData, actor: Actor): Promise<AllocationView> {
    const nominative = input.subject !== undefined;
    if (nominative === (input.team !== undefined || input.roleLabel !== undefined)) throw validation(['allocation : une personne, ou une équipe avec un rôle (exclusifs)']);
    if (!nominative && (!input.team || !input.roleLabel)) throw validation(['allocation générique : équipe et rôle sont obligatoires']);
    if (input.to && input.to < input.from) throw validation(['to : la fin précède le début']);
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id, key from project where key = $1', [input.project])).rows[0];
      if (!project) throw notFound(`Projet ${input.project}`);
      let teamId: string | null = null;
      if (input.subject) await this.requireKnown(c, input.subject);
      if (input.team) {
        teamId = (await c.query('select id from team where key = $1', [input.team])).rows[0]?.id ?? null;
        if (!teamId) throw notFound(`Équipe ${input.team}`);
      }
      const row = (await c.query(
        `insert into allocation (organization_id, project_id, subject, team_id, role_label, from_day, to_day, fte, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [organizationId, project.id, input.subject ?? null, teamId, input.roleLabel ?? null, input.from, input.to, input.fte, actor.id])).rows[0];
      await audit(c, organizationId, actor, 'capacity.allocation', `project:${input.project}`, { subject: input.subject ?? null, team: input.team ?? null, fte: input.fte });
      return { id: row.id, project: input.project, subject: input.subject ?? null, team: input.team ?? null, roleLabel: input.roleLabel ?? null, from: input.from, to: input.to, fte: input.fte };
    });
  }

  async removeAllocation(organizationId: string, projectKey: string, id: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const r = await c.query('delete from allocation where id = $1 and project_id = (select id from project where key = $2)', [id, projectKey]);
      if (r.rowCount === 0) throw notFound('Allocation');
      await audit(c, organizationId, actor, 'capacity.allocation.remove', `project:${projectKey}`, { id });
    });
  }
}
