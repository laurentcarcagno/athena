import { Db } from '../core/db';

export const USAGE_ROUTES = ['list', 'summary', 'detail', 'health', 'health_csv'] as const;
export type UsageRoute = (typeof USAGE_ROUTES)[number];
export type UsageRole = 'admin' | 'pmo' | 'director' | 'pm' | 'manager' | 'other';

/** Rôle PPM le plus élevé d'une personne : un seul compteur par accès, jamais la liste des rôles. */
export function usageRole(roles: readonly string[]): UsageRole {
  for (const [role, name] of [['athena-admin', 'admin'], ['athena-pmo', 'pmo'], ['athena-director', 'director'], ['athena-pm', 'pm'], ['athena-manager', 'manager']] as const) if (roles.includes(role)) return name;
  return 'other';
}

/** Journal d'usage agrégé (KPI 6) : un compteur quotidien par rôle et route de portefeuille, sans identité ni contenu. */
export class UsageService {
  constructor(private readonly db: Db) {}

  /** Compte un accès ; n'échoue jamais (le journal ne doit pas gêner la lecture). */
  async hit(organizationId: string, roles: readonly string[], route: UsageRoute, now: Date = new Date()): Promise<void> {
    try {
      await this.db.tx(organizationId, (c) => c.query(
        `insert into portfolio_usage (organization_id, usage_day, role, route, hits) values ($1, $2::date, $3, $4, 1)
         on conflict (organization_id, usage_day, role, route) do update set hits = portfolio_usage.hits + 1`,
        [organizationId, now.toISOString().slice(0, 10), usageRole(roles), route]), { system: true });
    } catch (error) { if (process.env["ATHENA_DEBUG_USAGE"]) console.error(error); }
  }

  /** Compteurs des `days` derniers jours, du plus récent au plus ancien. */
  async report(organizationId: string, days = 30): Promise<Array<{ day: string; role: UsageRole; route: UsageRoute; hits: number }>> {
    return this.db.tx(organizationId, async (c) => (await c.query(
      `select to_char(usage_day, 'YYYY-MM-DD') as day, role, route, hits from portfolio_usage where usage_day > current_date - $1::int order by usage_day desc, role, route`,
      [Math.min(Math.max(Math.floor(days), 1), 365)])).rows as Array<{ day: string; role: UsageRole; route: UsageRoute; hits: number }>);
  }
}
