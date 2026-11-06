import { Db } from './db';
import { notFound, validation } from './errors';
import { builtinTrackerTypes } from './tracker-types';

/** Onglets d'un projet, dans l'ordre fixe de la spécification (ADR-0002 § 3). */
export const PROJECT_MODULES = ['overview', 'trackers', 'planning', 'traceability', 'documents', 'code', 'activity', 'members'] as const;
export type ProjectModule = (typeof PROJECT_MODULES)[number];

/**
 * Modules actifs d'un projet. Vue d'ensemble, Trackers, Planification, Activité et Membres existent toujours (on y crée
 * boards, sprints et acteurs). Les autres s'activent quand leurs données existent : types de liens, source documentaire, dépôt de code.
 * L'ordre renvoyé est toujours l'ordre fixe : un module inactif disparaît sans décaler les autres.
 */
export class ProjectOverviewService {
  constructor(private readonly db: Db) {}

  async modules(organizationId: string, projectKey: string): Promise<{ modules: ProjectModule[] }> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const has = async (table: string): Promise<boolean> =>
        ((await c.query(`select 1 from ${table} where project_id = $1 limit 1`, [project.id])).rowCount ?? 0) > 0;
      const active = new Set<ProjectModule>(['overview', 'trackers', 'planning', 'activity', 'members']);
      // Un type de lien d'organisation (ou livré, écrit au premier usage) ouvre aussi la traçabilité.
      if (await has('link_type') || ((await c.query('select 1 from link_type where project_id is null limit 1')).rowCount ?? 0) > 0) active.add('traceability');
      if (await has('doc_source')) active.add('documents');
      if (await has('code_repo')) active.add('code');
      return { modules: PROJECT_MODULES.filter((m) => active.has(m)) };
    });
  }

  /**
   * Flux d'activité du projet, du plus récent au plus ancien : créations, modifications, transitions et commentaires.
   * Les champs à lecture restreinte n'apparaissent pas dans le résumé d'une modification pour un lecteur sans le rôle.
   * `next` est un curseur opaque à renvoyer dans `before` pour la page suivante.
   */
  async activity(organizationId: string, projectKey: string, roles: string[], filters: ActivityFilters = {}): Promise<ActivityFeed> {
    const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
    if (filters.kind && !ACTIVITY_KINDS.includes(filters.kind)) throw validation(['type d’événement inconnu']);
    let cursor: { at: string; id: string } | null = null;
    if (filters.before) {
      const [at, id] = filters.before.split('|');
      if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/.test(id)) throw validation(['curseur invalide']);
      cursor = { at, id };
    }
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const events = `
        select r.id, r.created_at, r.actor, a.key, t.key as tracker, r.diff, r.version,
               case when r.version = 1 then 'created' when r.diff ? 'status' then 'transition' else 'updated' end as kind
        from artifact_revision r join artifact a on a.id = r.artifact_id join tracker t on t.id = a.tracker_id where a.project_id = $1
        union all
        select cm.id, cm.created_at, cm.author, a.key, t.key, null::jsonb, null::int, 'comment'
        from comment cm join artifact a on a.id = cm.artifact_id join tracker t on t.id = a.tracker_id where a.project_id = $1`;
      const rows = (await c.query(
        `select e.id, e.created_at::text as at_text, e.actor, e.key, e.tracker, e.diff, e.kind, coalesce(u.display_name, e.actor) as actor_name
         from (${events}) e left join user_account u on u.subject = e.actor
         where ($2::text is null or e.tracker = $2) and ($3::text is null or e.actor = $3) and ($4::text is null or e.kind = $4)
           and ($5::timestamptz is null or (e.created_at, e.id) < ($5::timestamptz, $6::uuid))
         order by e.created_at desc, e.id desc limit $7`,
        [project.id, filters.tracker ?? null, filters.actor ?? null, filters.kind ?? null, cursor?.at ?? null, cursor?.id ?? null, limit + 1],
      )).rows;
      const restricted = new Map<string, Set<string>>();
      const isAdmin = roles.includes('athena-admin');
      for (const f of (await c.query(
        `select t.key as tracker, f.key, f.read_roles from field_definition f join tracker t on t.id = f.tracker_id where t.project_id = $1 and f.read_roles is not null`, [project.id])).rows) {
        if (!isAdmin && !(f.read_roles as string[]).some((r) => roles.includes(r))) {
          const set = restricted.get(f.tracker as string) ?? new Set<string>();
          set.add(f.key as string);
          restricted.set(f.tracker as string, set);
        }
      }
      const page = rows.slice(0, limit);
      const items = page.map((r): ActivityItem => {
        const diff = (r.diff ?? {}) as Record<string, { from: unknown; to: unknown }>;
        const hidden = restricted.get(r.tracker as string);
        const status = diff['status'];
        return {
          id: r.id as string, kind: r.kind as ActivityKind, at: new Date(r.at_text as string).toISOString(), key: r.key as string, tracker: r.tracker as string,
          actor: r.actor as string, actorName: r.actor_name as string,
          fields: r.kind === 'updated' ? Object.keys(diff).filter((k) => !hidden?.has(k)).sort() : [],
          from: r.kind === 'transition' && status ? String(status.from ?? '') : null, to: r.kind === 'transition' && status ? String(status.to ?? '') : null,
        };
      });
      const last = page.at(-1);
      const people = (await c.query(
        `select distinct r.actor as subject, coalesce(u.display_name, r.actor) as name from artifact_revision r join artifact a on a.id = r.artifact_id
         left join user_account u on u.subject = r.actor where a.project_id = $1 order by name limit 100`, [project.id])).rows as Array<{ subject: string; name: string }>;
      return { items, next: rows.length > limit && last ? `${last.at_text}|${last.id}` : null, people };
    });
  }

  /**
   * Carte des trackers du projet : par tracker, compteurs par statut, éléments assignés à `username` (hors terminés)
   * et dernière activité. La catégorie vient du type du tracker (« other » sans type).
   */
  async overview(organizationId: string, projectKey: string, username: string): Promise<ProjectOverview> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const categories = new Map(builtinTrackerTypes().map((t) => [t.key, t.category as string]));
      for (const r of (await c.query('select key, category from tracker_type')).rows) categories.set(r.key as string, r.category as string);
      const trackers = (await c.query('select id, key, name, type_key from tracker where project_id = $1 order by key', [project.id])).rows;
      const out: TrackerOverview[] = [];
      for (const t of trackers) {
        const statuses = (await c.query(
          `select s.key, s.name, s.category, count(a.id)::int as n from status s left join artifact a on a.status_id = s.id
           where s.tracker_id = $1 group by s.id order by s.position`, [t.id])).rows;
        const assignee = (await c.query("select key from field_definition where tracker_id = $1 and semantic_role = 'assignee'", [t.id])).rows[0]?.key as string | undefined;
        const mine = assignee
          ? Number((await c.query(
            `select count(*) n from artifact a join status s on s.id = a.status_id
             where a.tracker_id = $1 and s.category <> 'done' and a."values" ->> $2::text = $3`, [t.id, assignee, username])).rows[0].n)
          : 0;
        const last = (await c.query('select max(updated_at) at from artifact where tracker_id = $1', [t.id])).rows[0].at as Date | null;
        out.push({
          key: t.key, name: t.name, typeKey: t.type_key ?? null, category: (t.type_key && categories.get(t.type_key)) || 'other',
          artifacts: statuses.reduce((n, s) => n + (s.n as number), 0), mine, lastActivity: last ? last.toISOString() : null,
          statuses: statuses.map((s) => ({ key: s.key, name: s.name, category: s.category, count: s.n })),
        });
      }
      return { trackers: out };
    });
  }
}

export interface TrackerOverview {
  key: string; name: string; typeKey: string | null; category: string; artifacts: number; mine: number; lastActivity: string | null;
  statuses: Array<{ key: string; name: string; category: string; count: number }>;
}
export interface ProjectOverview { trackers: TrackerOverview[] }

export type ActivityKind = 'created' | 'updated' | 'transition' | 'comment';
export const ACTIVITY_KINDS: readonly ActivityKind[] = ['created', 'updated', 'transition', 'comment'];

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  at: string;
  key: string;
  tracker: string;
  actor: string;
  actorName: string;
  /** Champs modifiés (hors champs à lecture restreinte pour le lecteur) ; vide pour une création, une transition ou un commentaire. */
  fields: string[];
  from: string | null;
  to: string | null;
}
export interface ActivityFeed { items: ActivityItem[]; next: string | null; people: Array<{ subject: string; name: string }> }
export interface ActivityFilters { tracker?: string; actor?: string; kind?: ActivityKind; before?: string; limit?: number }

