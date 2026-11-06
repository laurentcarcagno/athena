import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db, type Actor } from './db';
import { notFound, validation } from './errors';
import { audit } from './tracker.service';

export const AccessListInput = z.object({
  /** Clé du tracker visé ; absent ou nul : la liste du projet. */
  tracker: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/).nullish(),
  /** Sujets (identifiants Keycloak) des ayants droit : au moins un, sinon plus personne ne lirait (supprimer la liste à la place). */
  members: z.array(z.string().min(1).max(200)).min(1).max(500),
});
export type AccessListInput = z.infer<typeof AccessListInput>;

export interface AccessListView { scope: 'project' | 'tracker'; tracker: string | null; members: Array<{ subject: string; username: string; displayName: string }> }

/**
 * Listes d'ayants droit (besoin d'en connaître) par projet ou par tracker. Les lectures sont filtrées par la base (politiques RLS,
 * voir la migration 039) ; ce service ne fait que gérer les listes, hors filtre (un administrateur doit pouvoir gérer la liste d'un
 * projet qu'il ne lit pas), et chaque modification est consignée dans le journal d'audit chaîné.
 */
export class AccessService {
  constructor(private readonly db: Db) {}

  private async scope(c: PoolClient, projectKey: string, trackerKey: string | null | undefined) {
    const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
    if (!project) throw notFound(`Projet ${projectKey}`);
    if (!trackerKey) return { projectId: project.id as string, trackerId: null as string | null };
    const tracker = (await c.query('select id from tracker where project_id = $1 and key = $2', [project.id, trackerKey])).rows[0];
    if (!tracker) throw notFound(`Tracker ${projectKey}/${trackerKey}`);
    return { projectId: project.id as string, trackerId: tracker.id as string };
  }

  async list(organizationId: string, projectKey: string): Promise<AccessListView[]> {
    return this.db.tx(organizationId, async (c) => {
      const { projectId } = await this.scope(c, projectKey, null);
      const lists = (await c.query(
        `select l.id, t.key as tracker from access_list l left join tracker t on t.id = l.tracker_id where l.project_id = $1 order by t.key nulls first`, [projectId])).rows;
      const out: AccessListView[] = [];
      for (const l of lists) {
        const members = (await c.query(
          `select m.subject, coalesce(u.username, m.subject) as username, coalesce(u.display_name, m.subject) as display_name
           from access_list_member m left join user_account u on u.subject = m.subject and u.organization_id = m.organization_id
           where m.access_list_id = $1 order by lower(coalesce(u.display_name, m.subject))`, [l.id])).rows;
        out.push({ scope: l.tracker ? 'tracker' : 'project', tracker: (l.tracker as string | null) ?? null, members: members.map((m) => ({ subject: m.subject as string, username: m.username as string, displayName: m.display_name as string })) });
      }
      return out;
    }, { system: true });
  }

  /** Remplace les membres de la liste (la crée au besoin). */
  async set(organizationId: string, projectKey: string, input: AccessListInput, actor: Actor): Promise<void> {
    const members = [...new Set(input.members)];
    await this.db.tx(organizationId, async (c) => {
      const { projectId, trackerId } = await this.scope(c, projectKey, input.tracker);
      const known = new Set((await c.query('select subject from user_account where subject = any($1::text[])', [members])).rows.map((r) => r.subject as string));
      const unknown = members.filter((m) => !known.has(m));
      if (unknown.length) throw validation([`utilisateur(s) inconnu(s) : ${unknown.join(', ')}`]);
      let list = (await c.query('select id from access_list where project_id = $1 and tracker_id is not distinct from $2', [projectId, trackerId])).rows[0];
      const before = list ? (await c.query('select subject from access_list_member where access_list_id = $1', [list.id])).rows.map((r) => r.subject as string) : [];
      if (!list) list = (await c.query('insert into access_list (organization_id, project_id, tracker_id, created_by) values ($1,$2,$3,$4) returning id', [organizationId, projectId, trackerId, actor.id])).rows[0];
      await c.query('delete from access_list_member where access_list_id = $1 and not (subject = any($2::text[]))', [list.id, members]);
      await c.query(
        `insert into access_list_member (access_list_id, organization_id, subject, added_by) select $1, $2, s, $3 from unnest($4::text[]) s on conflict do nothing`,
        [list.id, organizationId, actor.id, members]);
      await audit(c, organizationId, actor, 'access_list.set', `project:${projectKey}${input.tracker ? `/${input.tracker}` : ''}`, {
        added: members.filter((m) => !before.includes(m)), removed: before.filter((m) => !members.includes(m)), created: before.length === 0,
      });
    }, { system: true });
  }

  /** Supprime la liste : la portée redevient lisible selon les seuls rôles. */
  async remove(organizationId: string, projectKey: string, trackerKey: string | null | undefined, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const { projectId, trackerId } = await this.scope(c, projectKey, trackerKey);
      const deleted = await c.query('delete from access_list where project_id = $1 and tracker_id is not distinct from $2 returning id', [projectId, trackerId]);
      if (deleted.rowCount === 0) throw notFound('Liste d’ayants droit');
      await audit(c, organizationId, actor, 'access_list.delete', `project:${projectKey}${trackerKey ? `/${trackerKey}` : ''}`);
    }, { system: true });
  }
}
