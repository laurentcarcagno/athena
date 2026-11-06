import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db, type Actor } from './db';
import { notFound, validation } from './errors';
import { audit, outbox } from './tracker.service';

export const AccessListInput = z.object({
  /** Clé du tracker visé ; absent ou nul : la liste du projet. */
  tracker: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/).nullish(),
  /** Sujets (identifiants Keycloak) des ayants droit : au moins un, sinon plus personne ne lirait (supprimer la liste à la place). */
  members: z.array(z.string().min(1).max(200)).min(1).max(500),
});
export type AccessListInput = z.infer<typeof AccessListInput>;

export const EXPORT_CONTROLS = ['ITAR', 'EAR', 'dual_use'] as const;
export type ExportControl = (typeof EXPORT_CONTROLS)[number];
export const MarkingInput = z.object({ exportControl: z.enum(EXPORT_CONTROLS).nullable() });
export const ExportMembersInput = z.object({ members: z.array(z.string().min(1).max(200)).max(500) });
export type ExportMembersInput = z.infer<typeof ExportMembersInput>;

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

  /** Ayants droit du marquage de contrôle export du projet. */
  async exportMembers(organizationId: string, projectKey: string): Promise<{ members: Array<{ subject: string; username: string; displayName: string }>; marked: number }> {
    return this.db.tx(organizationId, async (c) => {
      const { projectId } = await this.scope(c, projectKey, null);
      const members = (await c.query(
        `select m.subject, coalesce(u.username, m.subject) as username, coalesce(u.display_name, m.subject) as display_name
         from export_control_member m left join user_account u on u.subject = m.subject and u.organization_id = m.organization_id
         where m.project_id = $1 order by lower(coalesce(u.display_name, m.subject))`, [projectId])).rows;
      const marked = Number((await c.query('select count(*) n from artifact where project_id = $1 and export_control is not null', [projectId])).rows[0].n);
      return { members: members.map((m) => ({ subject: m.subject as string, username: m.username as string, displayName: m.display_name as string })), marked };
    }, { system: true });
  }

  /** Remplace les ayants droit du marquage. Refusé si cela laisserait des items marqués sans aucun lecteur. */
  async setExportMembers(organizationId: string, projectKey: string, input: ExportMembersInput, actor: Actor): Promise<void> {
    const members = [...new Set(input.members)];
    await this.db.tx(organizationId, async (c) => {
      const { projectId } = await this.scope(c, projectKey, null);
      const known = new Set((await c.query('select subject from user_account where subject = any($1::text[])', [members])).rows.map((r) => r.subject as string));
      const unknown = members.filter((m) => !known.has(m));
      if (unknown.length) throw validation([`utilisateur(s) inconnu(s) : ${unknown.join(', ')}`]);
      const marked = Number((await c.query('select count(*) n from artifact where project_id = $1 and export_control is not null', [projectId])).rows[0].n);
      if (members.length === 0 && marked > 0) throw validation([`${marked} item(s) sont sous contrôle export : la liste ne peut pas être vidée (démarquez-les d’abord)`]);
      const before = (await c.query('select subject from export_control_member where project_id = $1', [projectId])).rows.map((r) => r.subject as string);
      await c.query('delete from export_control_member where project_id = $1 and not (subject = any($2::text[]))', [projectId, members]);
      await c.query('insert into export_control_member (organization_id, project_id, subject, added_by) select $1, $2, s, $3 from unnest($4::text[]) s on conflict do nothing', [organizationId, projectId, actor.id, members]);
      await audit(c, organizationId, actor, 'export_control.members', `project:${projectKey}`, { added: members.filter((m) => !before.includes(m)), removed: before.filter((m) => !members.includes(m)) });
    }, { system: true });
  }

  /**
   * Pose ou retire le marquage de contrôle export d'un item (administrateurs et chefs de projet, via le contrôleur). Le projet doit avoir
   * des ayants droit ; le démarquage d'un item marqué suppose de pouvoir le lire, donc d'être ayant droit. Révision, événement et audit.
   */
  async setMarking(organizationId: string, projectKey: string, key: string, value: ExportControl | null, actor: Actor): Promise<{ key: string; exportControl: ExportControl | null; version: number }> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const row = (await c.query('select a.id, a.key, a.version, a.export_control, a.status_id, a."values", t.key as tracker from artifact a join tracker t on t.id = a.tracker_id where a.project_id = $1 and a.id = resolve_artifact($1, $2) for update of a', [project.id, key])).rows[0];
      if (!row) throw notFound(`Artefact ${key}`);
      if ((row.export_control ?? null) === value) return { key: row.key as string, exportControl: value, version: row.version as number };
      if (value !== null) {
        const members = Number((await c.query('select count(*) n from export_control_member where project_id = $1', [project.id])).rows[0].n);
        if (members === 0) throw validation(['définissez d’abord les ayants droit du marquage de contrôle export du projet']);
      }
      const version = (row.version as number) + 1;
      await c.query('update artifact set export_control = $2, version = $3, updated_at = now() where id = $1', [row.id, value, version]);
      const status = (await c.query('select key from status where id = $1', [row.status_id])).rows[0].key as string;
      const diff = { export_control: { from: row.export_control ?? null, to: value } };
      const snapshot = { key: row.key, tracker: row.tracker, status, version, values: row.values };
      const revision = await c.query('insert into artifact_revision (organization_id, artifact_id, version, diff, actor, snapshot) values ($1,$2,$3,$4,$5,$6) returning event_id', [organizationId, row.id, version, JSON.stringify(diff), actor.id, JSON.stringify(snapshot)]);
      await outbox(c, organizationId, 'artifact', row.id as string, 'artifact.marking_changed', { eventId: revision.rows[0].event_id, key: row.key, version, actor: actor.id, exportControl: value });
      await audit(c, organizationId, actor, 'artifact.marking', `artifact:${row.key}`, { from: row.export_control ?? null, to: value, version });
      return { key: row.key as string, exportControl: value, version };
    });
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
