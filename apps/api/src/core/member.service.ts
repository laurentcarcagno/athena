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

  /**
   * Configuration d'un tracker : administrateur, chef du projet, ou administrateur désigné de ce tracker (plan § 15.3, administration déléguée).
   * Un administrateur de tracker ne configure que les trackers où il est désigné.
   */
  async requireTrackerAdmin(organizationId: string, projectKey: string, trackerKey: string, actor: Actor): Promise<void> {
    if (actor.roles.includes('athena-admin')) return;
    if (actor.roles.includes('athena-pm')) { try { await this.requireManager(organizationId, projectKey, actor); return; } catch { /* repli : administrateur de tracker */ } }
    const ok = await this.db.tx(organizationId, async (c) => (await c.query(
      `select 1 from tracker_admin ta join tracker t on t.id = ta.tracker_id join project p on p.id = t.project_id where p.key = $1 and t.key = $2 and ta.subject = $3`, [projectKey, trackerKey, actor.id])).rows[0], { system: true });
    if (!ok) throw forbidden(`Réservé aux administrateurs du tracker ${trackerKey}, aux chefs du projet et aux administrateurs.`);
  }

  async trackerAdmins(organizationId: string, projectKey: string, trackerKey: string): Promise<Array<{ subject: string; name: string | null; grantedAt: string }>> {
    return this.db.tx(organizationId, async (c) => (await c.query(
      `select ta.subject, u.display_name as name, ta.granted_at from tracker_admin ta join tracker t on t.id = ta.tracker_id join project p on p.id = t.project_id
         left join user_account u on u.subject = ta.subject and u.organization_id = ta.organization_id where p.key = $1 and t.key = $2 order by ta.granted_at`, [projectKey, trackerKey])).rows
      .map((r) => ({ subject: r.subject as string, name: (r.name as string | null) ?? null, grantedAt: new Date(r.granted_at).toISOString() })), { system: true });
  }

  async grantTrackerAdmin(organizationId: string, projectKey: string, trackerKey: string, subject: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const t = (await c.query('select t.id from tracker t join project p on p.id = t.project_id where p.key = $1 and t.key = $2', [projectKey, trackerKey])).rows[0];
      if (!t) throw notFound(`Tracker ${trackerKey}`);
      if (!(await c.query('select 1 from user_account where subject = $1', [subject])).rows[0]) throw notFound('Utilisateur');
      await c.query('insert into tracker_admin (tracker_id, organization_id, subject, granted_by) values ($1,$2,$3,$4) on conflict do nothing', [t.id, organizationId, subject, actor.id]);
      await audit(c, organizationId, actor, 'tracker.admin.grant', `tracker:${projectKey}/${trackerKey}`, { subject });
    }, { system: true });
  }

  async revokeTrackerAdmin(organizationId: string, projectKey: string, trackerKey: string, subject: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      await c.query('delete from tracker_admin ta using tracker t, project p where ta.tracker_id = t.id and t.project_id = p.id and p.key = $1 and t.key = $2 and ta.subject = $3', [projectKey, trackerKey, subject]);
      await audit(c, organizationId, actor, 'tracker.admin.revoke', `tracker:${projectKey}/${trackerKey}`, { subject });
    }, { system: true });
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
