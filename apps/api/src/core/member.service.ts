import { Db, type Actor } from './db';
import { forbidden, notFound, validation } from './errors';
import { audit } from './tracker.service';

export type MemberRole = 'manager' | 'member';
export interface MemberView { subject: string; username: string; displayName: string; email: string | null; role: MemberRole; addedBy: string }
export interface UserView { subject: string; username: string; displayName: string; email: string | null }

/** Acteurs d'un projet. Un administrateur gère tous les projets ; un chef de projet gère ceux dont il est `manager`. */
export class MemberService {
  constructor(private readonly db: Db) {}

  async users(organizationId: string): Promise<UserView[]> {
    return this.db.tx(organizationId, async (c) => (await c.query(
      'select subject, username, display_name, email from user_account order by lower(display_name), username',
    )).rows.map((r) => ({ subject: r.subject, username: r.username, displayName: r.display_name, email: r.email })));
  }

  async members(organizationId: string, projectKey: string): Promise<MemberView[]> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const rows = (await c.query(
        `select m.subject, m.role, m.added_by, coalesce(u.username, m.subject) as username, coalesce(u.display_name, m.subject) as display_name, u.email
           from project_member m left join user_account u on u.organization_id = m.organization_id and u.subject = m.subject
          where m.project_id = $1 order by (m.role = 'manager') desc, lower(coalesce(u.display_name, m.subject))`, [project.id])).rows;
      return rows.map((r) => ({ subject: r.subject, username: r.username, displayName: r.display_name, email: r.email, role: r.role, addedBy: r.added_by }));
    });
  }

  async set(organizationId: string, projectKey: string, subject: string, role: MemberRole, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const user = (await c.query('select 1 from user_account where subject = $1', [subject])).rows[0];
      if (!user) throw validation(['utilisateur inconnu : il doit s’être connecté au moins une fois']);
      await c.query(
        `insert into project_member (organization_id, project_id, subject, role, added_by) values ($1,$2,$3,$4,$5)
         on conflict (project_id, subject) do update set role = excluded.role`,
        [organizationId, project.id, subject, role, actor.id]);
      await audit(c, organizationId, actor, 'project.member.set', `project:${projectKey}`, { subject, role });
    });
  }

  async remove(organizationId: string, projectKey: string, subject: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const result = await c.query('delete from project_member where project_id = $1 and subject = $2', [project.id, subject]);
      if (result.rowCount === 0) throw notFound('Acteur');
      await audit(c, organizationId, actor, 'project.member.remove', `project:${projectKey}`, { subject });
    });
  }

  /** Autorise un administrateur, ou un chef de projet (rôle athena-pm) désigné `manager` du projet. */
  async requireManager(organizationId: string, projectKey: string, actor: Actor): Promise<void> {
    if (actor.roles.includes('athena-admin')) return;
    if (!actor.roles.includes('athena-pm')) throw forbidden('Réservé aux chefs de projet et aux administrateurs.');
    const ok = await this.db.tx(organizationId, async (c) => (await c.query(
      `select 1 from project_member m join project p on p.id = m.project_id where p.key = $1 and m.subject = $2 and m.role = 'manager'`, [projectKey, actor.id])).rows[0]);
    if (!ok) throw forbidden(`Vous n’êtes pas chef du projet ${projectKey}.`);
  }
}
