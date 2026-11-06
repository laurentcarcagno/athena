import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db, type Actor } from './db';
import { conflict, notFound, validation } from './errors';
import { resolveLinkType } from './link-type.service';
import { audit } from './tracker.service';

const pct = z.number().min(0).max(100);
export const CoverageRuleInput = z.object({
  name: z.string().trim().min(1).max(200),
  fromTracker: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/),
  linkType: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  direction: z.enum(['in', 'out', 'any']).default('any'),
  minCount: z.number().int().min(1).max(100).default(1),
  statuses: z.array(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/)).max(50).default([]),
  threshold: z.object({ target: pct.default(100), warning: pct.optional() }).default({ target: 100 }),
});
export type CoverageRuleInput = z.infer<typeof CoverageRuleInput>;

export interface CoverageRuleView extends CoverageRuleInput { key: string; scope: 'project' | 'organization' }
export type CoverageLevel = 'ok' | 'warning' | 'critical' | 'none';
export interface CoverageResult extends CoverageRuleView {
  total: number; covered: number; rate: number | null; level: CoverageLevel;
  /** Items visés ayant au moins un lien suspect (de n'importe quel type), comme le prédicat ATQL `suspect()`. */
  suspect: number;
  gaps: Array<{ key: string; title: string }>;
  /** Requêtes ATQL ouvrant la liste derrière chaque nombre ; `gaps` vaut `null` quand ATQL ne sait pas exprimer exactement la règle. */
  atql: { total: string; gaps: string | null; suspect: string };
  error: string | null;
}

export const COVERAGE_MAX_GAPS = 100;

const quote = (v: string) => `"${v}"`;
/** Requête ATQL des items visés par une règle (tracker et états). */
export function scopeQuery(rule: Pick<CoverageRuleInput, 'fromTracker' | 'statuses'>): string {
  const s = rule.statuses;
  const status = s.length === 0 ? '' : s.length === 1 ? ` AND status = ${quote(s[0]!)}` : ` AND (${s.map((x) => `status = ${quote(x)}`).join(' OR ')})`;
  return `tracker = ${rule.fromTracker}${status}`;
}

function levelOf(rate: number | null, threshold: { target: number; warning?: number | undefined }): CoverageLevel {
  if (rate === null) return 'none';
  if (rate >= threshold.target) return 'ok';
  if (threshold.warning !== undefined && rate >= threshold.warning) return 'warning';
  return 'critical';
}

/** Règles de couverture (organisation ou projet) et taux de respect, calculé en deux requêtes par règle. */
export class CoverageService {
  constructor(private readonly db: Db) {}

  async list(organizationId: string, projectKey: string | null): Promise<CoverageRuleView[]> {
    return this.db.tx(organizationId, async (c) => this.rules(c, projectKey === null ? null : await this.project(c, projectKey)));
  }

  private async project(c: PoolClient, key: string): Promise<string> {
    const row = (await c.query('select id from project where key = $1', [key])).rows[0];
    if (!row) throw notFound(`Projet ${key}`);
    return row.id as string;
  }

  /** Règles applicables : celles de l'organisation, remplacées par celles du projet de même clé. */
  private async rules(c: PoolClient, projectId: string | null): Promise<CoverageRuleView[]> {
    const rows = (await c.query('select * from coverage_rule where project_id is null or project_id = $1 order by name, key', [projectId])).rows;
    const own = new Set(rows.filter((r) => r.project_id !== null).map((r) => r.key as string));
    return rows.filter((r) => r.project_id !== null || !own.has(r.key as string)).map((r) => ({
      key: r.key as string, scope: r.project_id === null ? 'organization' : 'project', name: r.name as string, fromTracker: r.from_tracker_key as string,
      linkType: r.link_type_key as string, direction: r.direction as 'in' | 'out' | 'any', minCount: r.min_count as number,
      statuses: r.status_filter as string[], threshold: r.threshold as CoverageRuleInput['threshold'],
    }));
  }

  async create(organizationId: string, projectKey: string | null, key: string, input: CoverageRuleInput, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const projectId = projectKey === null ? null : await this.project(c, projectKey);
      if (input.threshold.warning !== undefined && input.threshold.warning > input.threshold.target) throw validation(['le seuil d’alerte ne peut pas dépasser l’objectif']);
      const taken = (await c.query('select 1 from coverage_rule where key = $2 and project_id is not distinct from $1', [projectId, key])).rowCount;
      if (taken) throw conflict(`La règle ${key} existe déjà.`);
      await c.query(
        `insert into coverage_rule (organization_id, project_id, key, name, from_tracker_key, link_type_key, direction, min_count, status_filter, threshold)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [organizationId, projectId, key, input.name, input.fromTracker, input.linkType, input.direction, input.minCount, input.statuses, JSON.stringify(input.threshold)],
      );
      await audit(c, organizationId, actor, 'coverage_rule.create', `coverage_rule:${projectKey ?? '*'}:${key}`);
    });
  }

  async remove(organizationId: string, projectKey: string | null, key: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const projectId = projectKey === null ? null : await this.project(c, projectKey);
      const done = await c.query('delete from coverage_rule where key = $2 and project_id is not distinct from $1', [projectId, key]);
      if (!done.rowCount) throw notFound(`Règle ${key}`);
      await audit(c, organizationId, actor, 'coverage_rule.delete', `coverage_rule:${projectKey ?? '*'}:${key}`);
    });
  }

  /** Taux de respect de chaque règle applicable au projet, items en défaut (100 au plus) et items à lien suspect. */
  async evaluate(organizationId: string, projectKey: string, roles: string[]): Promise<CoverageResult[]> {
    return this.db.tx(organizationId, async (c) => {
      const projectId = await this.project(c, projectKey);
      const results: CoverageResult[] = [];
      for (const view of await this.rules(c, projectId)) {
        const atql = {
          total: scopeQuery(view),
          gaps: view.minCount === 1 && view.direction === 'any' ? `${scopeQuery(view)} AND notLinked(${quote(view.linkType)})` : null,
          suspect: `${scopeQuery(view)} AND suspect()`,
        };
        const empty: CoverageResult = { ...view, total: 0, covered: 0, rate: null, level: 'none', suspect: 0, gaps: [], atql, error: null };
        const tracker = (await c.query('select id from tracker where project_id = $1 and key = $2', [projectId, view.fromTracker])).rows[0];
        if (!tracker) { results.push({ ...empty, error: `Le tracker ${view.fromTracker} n’existe pas dans ce projet.` }); continue; }
        const type = await resolveLinkType(c, organizationId, projectId, view.linkType);
        if (!type) { results.push({ ...empty, error: `Le type de lien ${view.linkType} n’existe pas.` }); continue; }
        const filtered = view.statuses.length > 0;
        const params: unknown[] = [tracker.id, type.id, view.minCount, ...(filtered ? [view.statuses] : [])];
        const sides = [
          view.direction !== 'in' ? 'select from_artifact_id as aid from artifact_link where link_type_id = $2' : null,
          view.direction !== 'out' ? 'select to_artifact_id as aid from artifact_link where link_type_id = $2' : null,
        ].filter(Boolean).join(' union all ');
        const base = `with scope as (select a.id, a.key, a."values" as values from artifact a join status s on s.id = a.status_id where a.tracker_id = $1 ${filtered ? 'and s.key = any($4)' : ''}),
          counts as (select aid, count(*) n from (${sides}) x where aid in (select id from scope) group by aid),
          suspects as (select from_artifact_id as aid from artifact_link where suspect union select to_artifact_id from artifact_link where suspect)`;
        const totals = (await c.query(
          `${base} select count(*) as total, count(*) filter (where coalesce(cn.n, 0) >= $3) as covered,
             count(*) filter (where sc.id in (select aid from suspects)) as suspect
           from scope sc left join counts cn on cn.aid = sc.id`, params,
        )).rows[0];
        const gapRows = (await c.query(
          `${base} select sc.key, sc.values from scope sc left join counts cn on cn.aid = sc.id where coalesce(cn.n, 0) < $3 order by sc.key limit ${COVERAGE_MAX_GAPS}`, params,
        )).rows;
        const titleField = (await c.query("select key, read_roles from field_definition where tracker_id = $1 and semantic_role = 'title'", [tracker.id])).rows[0];
        const visible = !titleField?.read_roles || roles.includes('athena-admin') || (titleField.read_roles as string[]).some((r) => roles.includes(r));
        const total = Number(totals.total);
        const covered = Number(totals.covered);
        const rate = total === 0 ? null : Math.round((covered / total) * 1000) / 10;
        results.push({
          ...empty, total, covered, rate, level: levelOf(rate, view.threshold), suspect: Number(totals.suspect),
          gaps: gapRows.map((g) => ({ key: g.key as string, title: visible ? String((g.values as Record<string, unknown>)[(titleField?.key as string | undefined) ?? 'title'] ?? g.key) : (g.key as string) })),
        });
      }
      return results;
    });
  }
}
