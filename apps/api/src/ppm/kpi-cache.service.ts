import type { KpiService, ProjectKpis } from '../agile/kpi.service';
import { Db, type Actor } from '../core/db';

/** Identité du traitement de matérialisation : voit tous les projets. */
export const KPI_SYSTEM_ACTOR: Actor = { id: 'system:kpi', roles: ['athena-admin'] };
/** Délai de fraîcheur d'une ligne matérialisée (au-delà, la lecture recalcule en direct). */
export const KPI_FRESH_MS = 15 * 60_000;

/**
 * Indicateurs de projet matérialisés (lot 26, B42) : `kpis()` lit la ligne `project_kpi` si elle est fraîche, sinon calcule en direct. Le job `refresh()` écrit une ligne par
 * projet en contexte système ; la lecture repasse par la politique de visibilité du projet. Même forme de résultat que `KpiService.kpis` : les appelants ne changent pas.
 */
export class CachedKpiService implements Pick<KpiService, 'kpis'> {
  constructor(private readonly db: Db, private readonly live: Pick<KpiService, 'kpis'>, private readonly freshMs = KPI_FRESH_MS) {}

  async kpis(organizationId: string, projectKey: string, actor: { id: string; roles: string[] }, today: Date = new Date()): Promise<ProjectKpis> {
    const row = await this.db.tx(organizationId, async (c) => (await c.query(
      `select k.metrics, k.computed_at from project_kpi k join project p on p.id = k.project_id where p.key = $1`, [projectKey])).rows[0]);
    if (row && today.getTime() - new Date(row.computed_at).getTime() <= this.freshMs && today.getTime() >= new Date(row.computed_at).getTime() - 60_000) return row.metrics as ProjectKpis;
    return this.live.kpis(organizationId, projectKey, actor, today);
  }

  /** Recalcule et écrit les indicateurs de tous les projets de l'organisation (ou de ceux donnés) ; retourne le nombre de projets écrits. */
  async refresh(organizationId: string, projectKeys?: string[], now: Date = new Date()): Promise<number> {
    const projects = await this.db.tx(organizationId, async (c) => (await c.query('select id, key from project where ($1::text[] is null or key = any($1)) order by key', [projectKeys ?? null])).rows as Array<{ id: string; key: string }>, { system: true });
    let written = 0;
    for (const p of projects) {
      const metrics = await this.live.kpis(organizationId, p.key, KPI_SYSTEM_ACTOR, now).catch(() => null);
      if (!metrics) continue;
      await this.db.tx(organizationId, (c) => c.query(
        `insert into project_kpi (project_id, organization_id, metrics, computed_at) values ($1,$2,$3,$4)
         on conflict (project_id) do update set metrics = excluded.metrics, computed_at = excluded.computed_at`, [p.id, organizationId, JSON.stringify(metrics), now.toISOString()]), { system: true });
      written += 1;
    }
    return written;
  }
}
