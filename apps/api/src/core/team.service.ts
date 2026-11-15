import type { PoolClient } from 'pg';
import { Db, type Actor } from './db';
import { conflict, forbidden, notFound, validation } from './errors';
import { audit } from './tracker.service';

export type TeamRole = 'manager' | 'member';
export interface TeamView { key: string; name: string; description: string; members: number; managers: string[] }
export interface TeamMemberView { subject: string; name: string; role: TeamRole }
export interface TeamDetail { key: string; name: string; description: string; members: TeamMemberView[] }
export interface MemberLoad {
  subject: string; name: string; role: TeamRole;
  /** Tickets non terminés qui lui sont assignés, dont ceux dont l'échéance est passée. */
  open: number; late: number;
  /** Somme du champ « reste à faire » (rôle `remaining`) des tickets ouverts, dans l'unité du champ. */
  remaining: number;
  /** Charge par projet : nombre de tickets ouverts. */
  byProject: Array<{ project: string; open: number }>;
}
export interface TeamLoad { team: { key: string; name: string }; members: MemberLoad[]; totals: { open: number; late: number; remaining: number }; average: number }

const KEY = /^[a-z0-9][a-z0-9-]{1,29}$/;
const oversees = (roles: readonly string[]) => ['athena-admin', 'athena-pmo', 'athena-director', 'athena-pm'].some((r) => roles.includes(r));

/** Équipes et charge (ADR-0008). Un administrateur gère les équipes ; un manager voit la charge des siennes ; le directeur lit tout. */
export class TeamService {
  constructor(private readonly db: Db) {}

  /** Équipes visibles : toutes pour un administrateur, un chef de projet ou un directeur ; celles que l'on dirige pour un manager. */
  async list(organizationId: string, actor: Actor): Promise<TeamView[]> {
    return this.db.tx(organizationId, async (c) => (await c.query(
      `select t.key, t.name, t.description,
              (select count(*)::int from team_member m where m.team_id = t.id) as members,
              coalesce((select array_agg(coalesce(u.display_name, u.username, m.subject) order by coalesce(u.display_name, u.username, m.subject))
                          from team_member m left join user_account u on u.organization_id = m.organization_id and u.subject = m.subject
                         where m.team_id = t.id and m.role = 'manager'), '{}') as managers
         from team t
        where $1::boolean or exists (select 1 from team_member m where m.team_id = t.id and m.subject = $2 and m.role = 'manager')
        order by lower(t.name)`, [oversees(actor.roles), actor.id])).rows.map((r) => ({ key: r.key, name: r.name, description: r.description, members: r.members, managers: r.managers })));
  }

  async get(organizationId: string, key: string, actor: Actor): Promise<TeamDetail> {
    return this.db.tx(organizationId, async (c) => {
      const team = await this.requireView(c, key, actor);
      const rows = (await c.query(
        `select m.subject, m.role, coalesce(u.display_name, u.username, m.subject) as name
           from team_member m left join user_account u on u.organization_id = m.organization_id and u.subject = m.subject
          where m.team_id = $1 order by (m.role = 'manager') desc, lower(coalesce(u.display_name, u.username, m.subject))`, [team.id])).rows;
      return { key: team.key, name: team.name, description: team.description, members: rows.map((r) => ({ subject: r.subject, name: r.name, role: r.role })) };
    });
  }

  async create(organizationId: string, input: { key: string; name: string; description?: string }, actor: Actor): Promise<TeamDetail> {
    if (!KEY.test(input.key)) throw validation(['clé d’équipe invalide (minuscules, chiffres et tirets)']);
    await this.db.tx(organizationId, async (c) => {
      if ((await c.query('select 1 from team where key = $1', [input.key])).rows[0]) throw conflict(`L’équipe ${input.key} existe déjà.`);
      await c.query('insert into team (organization_id, key, name, description, created_by) values ($1,$2,$3,$4,$5)',
        [organizationId, input.key, input.name.trim(), (input.description ?? '').trim(), actor.id]);
      await audit(c, organizationId, actor, 'team.create', `team:${input.key}`, { name: input.name });
    });
    return this.get(organizationId, input.key, actor);
  }

  async update(organizationId: string, key: string, patch: { name?: string; description?: string }, actor: Actor): Promise<TeamDetail> {
    await this.db.tx(organizationId, async (c) => {
      const team = await this.requireTeam(c, key);
      await c.query('update team set name = coalesce($2, name), description = coalesce($3, description) where id = $1', [team.id, patch.name?.trim() ?? null, patch.description?.trim() ?? null]);
      await audit(c, organizationId, actor, 'team.update', `team:${key}`, patch);
    });
    return this.get(organizationId, key, actor);
  }

  async remove(organizationId: string, key: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const team = await this.requireTeam(c, key);
      await c.query('delete from team where id = $1', [team.id]);
      await audit(c, organizationId, actor, 'team.delete', `team:${key}`, {});
    });
  }

  async setMember(organizationId: string, key: string, subject: string, role: TeamRole, actor: Actor): Promise<TeamDetail> {
    await this.db.tx(organizationId, async (c) => {
      const team = await this.requireTeam(c, key);
      if (!(await c.query('select 1 from user_account where subject = $1', [subject])).rows[0]) throw validation(['utilisateur inconnu : il doit s’être connecté au moins une fois']);
      await c.query(
        `insert into team_member (organization_id, team_id, subject, role, added_by) values ($1,$2,$3,$4,$5)
         on conflict (team_id, subject) do update set role = excluded.role`, [organizationId, team.id, subject, role, actor.id]);
      await audit(c, organizationId, actor, 'team.member.set', `team:${key}`, { subject, role });
    });
    return this.get(organizationId, key, actor);
  }

  async removeMember(organizationId: string, key: string, subject: string, actor: Actor): Promise<TeamDetail> {
    await this.db.tx(organizationId, async (c) => {
      const team = await this.requireTeam(c, key);
      const r = await c.query('delete from team_member where team_id = $1 and subject = $2', [team.id, subject]);
      if (r.rowCount === 0) throw notFound('Membre de l’équipe');
      await audit(c, organizationId, actor, 'team.member.remove', `team:${key}`, { subject });
    });
    return this.get(organizationId, key, actor);
  }

  /** Charge de l'équipe : tickets ouverts, en retard et reste à faire par personne, tous projets confondus. */
  async load(organizationId: string, key: string, actor: Actor, today: Date = new Date()): Promise<TeamLoad> {
    return this.db.tx(organizationId, async (c) => {
      const team = await this.requireView(c, key, actor);
      const day = today.toISOString().slice(0, 10);
      const members = (await c.query(
        `select m.subject, m.role, coalesce(u.display_name, u.username, m.subject) as name, u.username
           from team_member m left join user_account u on u.organization_id = m.organization_id and u.subject = m.subject
          where m.team_id = $1`, [team.id])).rows as Array<{ subject: string; role: TeamRole; name: string; username: string | null }>;
      const items = (await c.query(
        `select p.key as project, a."values" ->> fa.key as assignee, a."values" ->> fd.key as due, a."values" ->> fr.key as rem
           from artifact a
           join project p on p.id = a.project_id
           join status st on st.id = a.status_id
           join field_definition fa on fa.tracker_id = a.tracker_id and fa.semantic_role = 'assignee'
           left join field_definition fd on fd.tracker_id = a.tracker_id and fd.semantic_role = 'due_date'
           left join field_definition fr on fr.tracker_id = a.tracker_id and fr.semantic_role = 'remaining'
          where st.category <> 'done' and coalesce(a."values" ->> fa.key, '') <> ''`)).rows as Array<{ project: string; assignee: string; due: string | null; rem: string | null }>;
      const load: MemberLoad[] = members.map((m) => {
        const mine = items.filter((i) => i.assignee === m.subject || (m.username !== null && i.assignee === m.username));
        const projects = new Map<string, number>();
        for (const i of mine) projects.set(i.project, (projects.get(i.project) ?? 0) + 1);
        return {
          subject: m.subject, name: m.name, role: m.role, open: mine.length,
          late: mine.filter((i) => i.due !== null && /^\d{4}-\d{2}-\d{2}/.test(i.due) && i.due.slice(0, 10) < day).length,
          remaining: mine.reduce((s, i) => s + (i.rem !== null && /^\d+(\.\d+)?$/.test(i.rem) ? Number(i.rem) : 0), 0),
          byProject: [...projects].map(([project, open]) => ({ project, open })).sort((a, b) => b.open - a.open || a.project.localeCompare(b.project)),
        };
      }).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, 'fr'));
      const totals = load.reduce((t, m) => ({ open: t.open + m.open, late: t.late + m.late, remaining: t.remaining + m.remaining }), { open: 0, late: 0, remaining: 0 });
      return { team: { key: team.key, name: team.name }, members: load, totals, average: load.length === 0 ? 0 : Math.round((10 * totals.open) / load.length) / 10 };
    });
  }

  private async requireTeam(c: PoolClient, key: string): Promise<{ id: string; key: string; name: string; description: string }> {
    const team = (await c.query('select id, key, name, description from team where key = $1', [key])).rows[0];
    if (!team) throw notFound(`Équipe ${key}`);
    return team;
  }

  /** Équipe lisible par l'acteur : administrateur, chef de projet et directeur toutes ; manager celles qu'il dirige. */
  private async requireView(c: PoolClient, key: string, actor: Actor) {
    const team = await this.requireTeam(c, key);
    if (oversees(actor.roles)) return team;
    const ok = (await c.query("select 1 from team_member where team_id = $1 and subject = $2 and role = 'manager'", [team.id, actor.id])).rows[0];
    if (!ok) throw forbidden(`Vous ne dirigez pas l’équipe ${key}.`);
    return team;
  }
}
