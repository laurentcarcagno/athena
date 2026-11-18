import { Controller, Get, Headers, Inject, NotFoundException, Header, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { Public } from '../auth/auth.guard';
import { loadConfig } from '../config';
import { PG_POOL } from '../core/core.tokens';
import { Db } from '../core/db';
import { metrics, type MetricsRegistry } from './metrics';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Exposition Prometheus (`GET /metrics`). Désactivée (404) tant que `METRICS_TOKEN` n'est pas défini ; sinon jeton porteur obligatoire.
 * Jauges métier lues à la demande, organisation par organisation : retard de l'outbox (synchronisation GitLab, webhooks, notifications) et échecs de livraison des webhooks.
 */
@Controller()
export class MetricsController {
  private readonly db: Db;
  private readonly registry: MetricsRegistry = metrics;

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {
    this.db = new Db(pool);
  }

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape(@Headers('authorization') authorization?: string): Promise<string> {
    const token = loadConfig().METRICS_TOKEN;
    if (!token) throw new NotFoundException();
    const presented = /^Bearer (.+)$/.exec(authorization ?? '')?.[1] ?? '';
    if (!same(presented, token)) throw new UnauthorizedException();
    return this.registry.render(await this.gauges());
  }

  private async gauges() {
    const out: Array<{ name: string; help: string; labels?: Record<string, string>; value: number }> = [{ name: 'athena_up', help: 'Instance en service', value: 1 }];
    let backlog = 0; let oldest = 0; const deliveries: Record<string, number> = { pending: 0, failed: 0 };
    try {
      const orgs = (await this.pool.query('select list_organization_ids() as id')).rows as Array<{ id: string }>;
      for (const { id } of orgs) {
        const r = await this.db.tx(id, async (c) => ({
          outbox: (await c.query('select count(*)::int n, coalesce(extract(epoch from now() - min(created_at)), 0)::float age from outbox_event where published_at is null')).rows[0],
          hooks: (await c.query("select status, count(*)::int n from webhook_delivery where status in ('pending','failed') group by status")).rows as Array<{ status: string; n: number }>,
        }), { system: true });
        backlog += r.outbox.n; oldest = Math.max(oldest, r.outbox.age);
        for (const h of r.hooks) deliveries[h.status] = (deliveries[h.status] ?? 0) + h.n;
      }
    } catch {
      out.push({ name: 'athena_scrape_errors', help: 'Lecture des jauges métier impossible', value: 1 });
      return out;
    }
    out.push(
      { name: 'athena_outbox_backlog', help: 'Événements de l’outbox non publiés', value: backlog },
      { name: 'athena_outbox_oldest_age_seconds', help: 'Âge du plus ancien événement non publié (retard de synchronisation)', value: Math.round(oldest) },
      { name: 'athena_webhook_deliveries', help: 'Livraisons de webhooks en attente ou en échec', labels: { status: 'pending' }, value: deliveries['pending'] ?? 0 },
      { name: 'athena_webhook_deliveries', help: 'Livraisons de webhooks en attente ou en échec', labels: { status: 'failed' }, value: deliveries['failed'] ?? 0 },
    );
    return out;
  }
}
