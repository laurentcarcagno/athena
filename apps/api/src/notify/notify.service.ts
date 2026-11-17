import type { PoolClient } from 'pg';
import { z } from 'zod';
import { compile } from '../atql/compile';
import { Db } from '../core/db';
import { notFound, validation } from '../core/errors';

export const NOTIFY_EVENTS = ['transition', 'mention', 'suspect', 'comment', 'approval', 'weather'] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export const SubscribeInput = z.object({
  scope: z.enum(['item', 'tracker', 'view']),
  /** Clé de l'item, clé du tracker ou identifiant de la vue enregistrée. */
  ref: z.string().min(1).max(200),
});
export type SubscribeInput = z.infer<typeof SubscribeInput>;
export const ReadInput = z.object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional(), read: z.boolean().default(true) })
  .refine((v) => v.all || (v.ids && v.ids.length > 0), { message: 'ids ou all requis' });
export const PrefInput = z.object({ enabled: z.boolean() });

export interface Emission {
  event: NotifyEvent;
  artifactId: string;
  /** Sujet de l'acteur : jamais notifié de sa propre action. */
  actor: string;
  /** Aucune valeur de champ : clés, statuts, identifiants seulement (le destinataire relit l'item selon ses droits). */
  payload: Record<string, unknown>;
  /** Destinataires directs (mentions), en plus des abonnés. */
  direct?: string[];
  /** Personnes déjà averties autrement (une mention remplace la notification de commentaire). */
  exclude?: string[];
  /** Seulement les destinataires directs, sans les abonnés (mentions). */
  directOnly?: boolean;
}

export interface NotificationView {
  id: string;
  event: NotifyEvent;
  project: string;
  /** Clé de l'item concerné. */
  key: string;
  actor: string;
  actorName: string;
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}
export interface SubscriptionView { id: string; scope: 'item' | 'tracker' | 'view'; ref: string; label: string }

/** Suit un item (abonnement discret du créateur et de qui commente). Idempotent. */
export async function follow(c: PoolClient, organizationId: string, subject: string, artifactId: string): Promise<void> {
  await c.query(
    `insert into subscription (organization_id, subject, scope, project_id, artifact_id)
     select $1, $2, 'item', project_id, id from artifact where id = $3 on conflict do nothing`,
    [organizationId, subject, artifactId],
  );
}

/** Génère les notifications d'un événement dans la transaction `c` ; retourne les destinataires notifiés. */
export async function emit(c: PoolClient, organizationId: string, e: Emission): Promise<string[]> {
  const art = (await c.query(
    'select a.project_id, a.tracker_id, p.key as project_key, a.key from artifact a join project p on p.id = a.project_id where a.id = $1', [e.artifactId])).rows[0];
  if (!art) return [];
  const candidates = new Set<string>(e.direct ?? []);
  if (!e.directOnly) for (const r of (await c.query(
    `select subject from subscription where (scope = 'item' and artifact_id = $1) or (scope = 'tracker' and tracker_id = $2)`,
    [e.artifactId, art.tracker_id])).rows) candidates.add(r.subject as string);
  if (!e.directOnly) for (const s of await viewSubscribers(c, art.project_key as string, e.artifactId)) candidates.add(s);
  candidates.delete(e.actor);
  for (const x of e.exclude ?? []) candidates.delete(x);
  if (candidates.size === 0) return [];
  const inserted = await c.query(
    `insert into notification (organization_id, recipient, event, project_id, artifact_id, actor, payload)
     select $1, s, $2, $3, $4, $5, $6 from unnest($7::text[]) s
     where coalesce((select enabled from notification_pref p where p.organization_id = $1 and p.subject = s and p.event = $2), true)
       and notify_can_see(s, $4)
     returning recipient`,
    [organizationId, e.event, art.project_id, e.artifactId, e.actor, JSON.stringify({ key: art.key, ...e.payload }), [...candidates]],
  );
  return inserted.rows.map((r) => r.recipient as string);
}

/** Abonnés à une vue dont la requête retient l'item. Les champs à lecture restreinte sont interdits dans la requête (pas de déduction). */
async function viewSubscribers(c: PoolClient, projectKey: string, artifactId: string): Promise<string[]> {
  const subs = (await c.query(
    `select s.subject, f.query, f.tracker_key from subscription s join saved_filter f on f.id = s.filter_id
     join project p on p.id = s.project_id where s.scope = 'view' and p.key = $1`, [projectKey])).rows;
  if (subs.length === 0) return [];
  const forbidden = new Set((await c.query(
    `select f.key from field_definition f join tracker t on t.id = f.tracker_id join project p on p.id = t.project_id
     where p.key = $1 and f.read_roles is not null`, [projectKey])).rows.map((r) => r.key as string));
  const out: string[] = [];
  for (const s of subs) {
    await c.query('savepoint notify_view');
    try {
      const compiled = compile(s.query as string, { currentUser: s.subject as string, forbiddenFields: forbidden }, [projectKey]);
      const params = compiled.params.slice(0, compiled.whereParamCount);
      const artifactParam = `$${params.push(artifactId)}`;
      const trackerClause = s.tracker_key ? ` and t.key = $${params.push(s.tracker_key)}` : '';
      const hit = await c.query(
        `select 1 from artifact a join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id join project p on p.id = a.project_id
         where p.key = $1 and ${compiled.where} and a.id = ${artifactParam}${trackerClause}`, params);
      if (hit.rowCount) out.push(s.subject as string);
    } catch {
      await c.query('rollback to savepoint notify_view'); // requête devenue invalide : pas de notification, jamais d'échec de l'événement
    }
    await c.query('release savepoint notify_view');
  }
  return out;
}


/**
 * Notifications : abonnements par item, tracker ou vue, réglages par événement. La génération a lieu dans la transaction de
 * l'événement (atomique avec lui) et ne retient que les destinataires qui peuvent lire l'item (`notify_can_see`) ; la lecture
 * est filtrée à son tour par la politique de la table, donc un droit retiré masque aussi les notifications déjà reçues.
 */
export class NotifyService {
  constructor(private readonly db: Db) {}

  /** Génère les notifications d'un événement dans la transaction `c` ; retourne le nombre de destinataires. */
  async emitIn(c: PoolClient, organizationId: string, e: Emission): Promise<number> {
    return (await emit(c, organizationId, e)).length;
  }

  async list(organizationId: string, subject: string, options: { unread?: boolean; limit?: number; event?: NotifyEvent } = {}): Promise<{ items: NotificationView[]; unread: number }> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    return this.db.tx(organizationId, async (c) => {
      const rows = (await c.query(
        `select n.id, n.event, p.key as project, a.key, n.actor, coalesce(u.display_name, n.actor) as actor_name, n.payload, n.read_at, n.created_at
         from notification n join project p on p.id = n.project_id left join artifact a on a.id = n.artifact_id
         left join user_account u on u.organization_id = n.organization_id and u.subject = n.actor
         where n.recipient = $1 and ($2::boolean is not true or n.read_at is null) and ($4::text is null or n.event = $4) order by n.created_at desc, n.id limit $3`, [subject, options.unread ?? false, limit, options.event ?? null])).rows;
      const unread = Number((await c.query('select count(*) n from notification where recipient = $1 and read_at is null', [subject])).rows[0].n);
      return {
        unread,
        items: rows.map((r): NotificationView => ({
          id: r.id, event: r.event, project: r.project, key: (r.key as string | null) ?? '', actor: r.actor, actorName: r.actor_name,
          payload: r.payload as Record<string, unknown>, read: r.read_at !== null, createdAt: (r.created_at as Date).toISOString(),
        })),
      };
    });
  }

  /** Marque des notifications (les siennes seulement) lues ou non lues. */
  async markRead(organizationId: string, subject: string, target: { ids?: string[]; all?: boolean }, read: boolean): Promise<number> {
    return this.db.tx(organizationId, async (c) => {
      const result = await c.query(
        `update notification set read_at = case when $3 then coalesce(read_at, now()) else null end
         where recipient = $1 and ($2::uuid[] is null or id = any($2::uuid[]))`,
        [subject, target.all ? null : (target.ids ?? []), read]);
      return result.rowCount ?? 0;
    });
  }

  async subscribe(organizationId: string, subject: string, projectKey: string, input: SubscribeInput): Promise<SubscriptionView> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      let column: 'artifact_id' | 'tracker_id' | 'filter_id';
      let target: { id: string; label: string };
      if (input.scope === 'item') {
        const row = (await c.query('select id, key from artifact where id = resolve_artifact($1, $2)', [project.id, input.ref])).rows[0];
        if (!row) throw notFound(`Ticket ${input.ref}`);
        column = 'artifact_id'; target = { id: row.id, label: row.key };
      } else if (input.scope === 'tracker') {
        const row = (await c.query('select id, key from tracker where project_id = $1 and key = $2', [project.id, input.ref])).rows[0];
        if (!row) throw notFound(`Tracker ${input.ref}`);
        column = 'tracker_id'; target = { id: row.id, label: row.key };
      } else {
        if (!/^[0-9a-f-]{36}$/.test(input.ref)) throw validation(['vue : identifiant invalide']);
        const row = (await c.query('select id, name from saved_filter where id = $1 and project_id = $2 and (owner = $3 or shared)', [input.ref, project.id, subject])).rows[0];
        if (!row) throw notFound('Vue');
        column = 'filter_id'; target = { id: row.id, label: row.name };
      }
      const fields = input.scope === 'item' ? 'artifact_id' : input.scope === 'tracker' ? 'tracker_id' : 'filter_id';
      await c.query(
        `insert into subscription (organization_id, subject, scope, project_id, ${column}) values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [organizationId, subject, input.scope, project.id, target.id]);
      const id = (await c.query(`select id from subscription where subject = $1 and scope = $2 and ${fields} = $3`, [subject, input.scope, target.id])).rows[0].id as string;
      return { id, scope: input.scope, ref: input.scope === 'view' ? target.id : target.label, label: target.label };
    });
  }

  async unsubscribe(organizationId: string, subject: string, id: string): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      if (!/^[0-9a-f-]{36}$/.test(id)) throw notFound('Abonnement');
      const result = await c.query('delete from subscription where id = $1 and subject = $2', [id, subject]);
      if (result.rowCount === 0) throw notFound('Abonnement');
    });
  }

  /** Abonnements de la personne dans le projet (ceux dont elle ne peut plus lire la cible disparaissent). */
  async subscriptions(organizationId: string, subject: string, projectKey: string): Promise<SubscriptionView[]> {
    return this.db.tx(organizationId, async (c) => {
      const rows = (await c.query(
        `select s.id, s.scope, a.key as item_key, t.key as tracker_key, f.id as filter_id, f.name as filter_name
         from subscription s join project p on p.id = s.project_id
         left join artifact a on a.id = s.artifact_id left join tracker t on t.id = s.tracker_id left join saved_filter f on f.id = s.filter_id
         where s.subject = $1 and p.key = $2 order by s.created_at, s.id`, [subject, projectKey])).rows;
      return rows.map((r): SubscriptionView => r.scope === 'item' ? { id: r.id, scope: 'item', ref: r.item_key, label: r.item_key }
        : r.scope === 'tracker' ? { id: r.id, scope: 'tracker', ref: r.tracker_key, label: r.tracker_key }
        : { id: r.id, scope: 'view', ref: r.filter_id, label: r.filter_name });
    });
  }

  /**
   * Personnes que `subject` peut mentionner sur l'item : celles qui peuvent le lire (listes d'ayants droit, contrôle export), dont le
   * nom ou l'identifiant commence par `q`. Un utilisateur sans accès n'apparaît jamais, ce qui ne révèle pas son existence.
   */
  async mentionable(organizationId: string, subject: string, projectKey: string, key: string, q: string): Promise<Array<{ username: string; displayName: string }>> {
    return this.db.tx(organizationId, async (c) => {
      const art = (await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [projectKey, key])).rows[0];
      if (!art) throw notFound(`Ticket ${key}`);
      const like = `${q.trim().replace(/[\\%_]/g, '\\$&')}%`;
      const rows = (await c.query(
        `select username, display_name from user_account
         where subject <> $2 and (username ilike $3 or display_name ilike $3 or display_name ilike '% ' || $3) and notify_can_see(subject, $1)
         order by username limit 8`, [art.id, subject, like])).rows;
      return rows.map((r) => ({ username: r.username as string, displayName: r.display_name as string }));
    });
  }

  async prefs(organizationId: string, subject: string): Promise<Record<NotifyEvent, boolean>> {
    return this.db.tx(organizationId, async (c) => {
      const out = Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, true])) as Record<NotifyEvent, boolean>;
      for (const r of (await c.query('select event, enabled from notification_pref where subject = $1', [subject])).rows) out[r.event as NotifyEvent] = r.enabled as boolean;
      return out;
    });
  }

  async setPref(organizationId: string, subject: string, event: NotifyEvent, enabled: boolean): Promise<void> {
    if (!NOTIFY_EVENTS.includes(event)) throw validation([`événement inconnu : ${event}`]);
    await this.db.tx(organizationId, async (c) => {
      await c.query(
        `insert into notification_pref (organization_id, subject, event, enabled) values ($1,$2,$3,$4)
         on conflict (organization_id, subject, event) do update set enabled = excluded.enabled`, [organizationId, subject, event, enabled]);
    });
  }
}
