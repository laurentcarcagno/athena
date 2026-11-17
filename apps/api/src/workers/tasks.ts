import http from 'node:http';
import type { Pool } from 'pg';
import { PgSessionStore } from '../auth/session';
import type { AutomationService } from '../automation/automation.service';
import type { PluginService } from '../plugins/plugin.service';
import type { HistorySync } from '../history/history-sync';
import type { WebhookService } from '../webhooks/webhook.service';
import type { DigestService } from '../notify/digest';
import type { WeatherReminderService } from '../ppm/weather-reminder.service';
import { WorkerLoop, type LoopOptions } from './loop';

export interface WorkerDeps {
  pool: Pool;
  history?: HistorySync;
  webhooks?: WebhookService;
  automation?: AutomationService;
  plugins?: PluginService;
  digest?: DigestService;
  weather?: WeatherReminderService;
  log?: (message: string) => void;
}

/** Cycle webhooks : pour chaque organisation, met en file les événements puis livre les envois échus. */
export async function webhookCycle(pool: Pool, webhooks: WebhookService): Promise<{ queued: number; delivered: number; failed: number }> {
  const total = { queued: 0, delivered: 0, failed: 0 };
  const organizations = (await pool.query('select list_organization_ids() as id')).rows as Array<{ id: string }>;
  for (const { id } of organizations) {
    total.queued += await webhooks.enqueue(id);
    const result = await webhooks.deliverDue(id);
    total.delivered += result.delivered;
    total.failed += result.failed;
  }
  return total;
}

/** Construit les boucles du worker. Une boucle absente (service non configuré) n'est pas démarrée. */
export function buildWorkers(deps: WorkerDeps, intervals: { historyMs: number; webhooksMs: number; sessionsMs: number; automationMs?: number; digestMs?: number }): WorkerLoop[] {
  const options = (intervalMs: number): LoopOptions => ({ intervalMs, ...(deps.log ? { log: deps.log } : {}) });
  const loops: WorkerLoop[] = [];
  if (deps.history) {
    const history = deps.history;
    loops.push(new WorkerLoop('historique', async () => {
      const { committed, failed } = await history.runOnce();
      if (committed || failed) deps.log?.(`historique: ${committed} commit(s), ${failed} échec(s)`);
      if (failed) throw new Error(`${failed} événement(s) en échec`);
    }, options(intervals.historyMs)));
  }
  if (deps.webhooks) {
    const webhooks = deps.webhooks;
    loops.push(new WorkerLoop('webhooks', async () => {
      const r = await webhookCycle(deps.pool, webhooks);
      if (r.queued || r.delivered || r.failed) deps.log?.(`webhooks: ${r.queued} en file, ${r.delivered} livrés, ${r.failed} abandonnés`);
    }, options(intervals.webhooksMs)));
  }
  if (deps.automation) {
    const automation = deps.automation;
    loops.push(new WorkerLoop('automatisations', async () => {
      const organizations = (await deps.pool.query('select list_organization_ids() as id')).rows as Array<{ id: string }>;
      let done = 0;
      for (const { id } of organizations) done += (await automation.process(id)) + (await automation.runDue(id));
      if (done) deps.log?.(`automatisations: ${done} exécution(s)`);
    }, options(intervals.automationMs ?? 2000)));
  }
  if (deps.plugins) {
    const plugins = deps.plugins;
    loops.push(new WorkerLoop('plugins', async () => {
      const organizations = (await deps.pool.query('select list_organization_ids() as id')).rows as Array<{ id: string }>;
      let delivered = 0;
      for (const { id } of organizations) {
        await plugins.loadEnabled(id); // démarre les plugins nouvellement installés ou réactivés
        delivered += await plugins.dispatchHooks(id);
      }
      if (delivered) deps.log?.(`plugins: ${delivered} hook(s) exécuté(s)`);
    }, options(intervals.automationMs ?? 2000)));
  }
  if (deps.digest) {
    const digest = deps.digest;
    loops.push(new WorkerLoop('résumé', async () => {
      const organizations = (await deps.pool.query('select list_organization_ids() as id')).rows as Array<{ id: string }>;
      let sent = 0;
      for (const { id } of organizations) sent += await digest.runDue(id, new Date(), deps.log);
      if (sent) deps.log?.(`résumé: ${sent} courriel(s) envoyé(s)`);
    }, options(intervals.digestMs ?? 300_000)));
  }
  if (deps.weather) {
    const weather = deps.weather;
    // Rappel de météo (lot 18) : une vérification par heure suffit, le rappel n'est dû qu'au bout de plusieurs jours.
    loops.push(new WorkerLoop('météo', async () => {
      const organizations = (await deps.pool.query('select list_organization_ids() as id')).rows as Array<{ id: string }>;
      let sent = 0;
      for (const { id } of organizations) sent += await weather.run(id);
      if (sent) deps.log?.(`météo: ${sent} rappel(s) émis`);
    }, options(3_600_000)));
  }
  const sessions = new PgSessionStore(deps.pool);
  loops.push(new WorkerLoop('sessions', async () => {
    const purged = await sessions.purgeExpired();
    if (purged) deps.log?.(`sessions: ${purged} expirée(s) purgée(s)`);
  }, options(intervals.sessionsMs)));
  return loops;
}

/** Sonde de santé : 200 si chaque boucle a tourné récemment et n'échoue pas en continu, sinon 503. */
export function healthServer(loops: WorkerLoop[], port: number, staleMs = 5 * 60_000): http.Server {
  return http
    .createServer((request, response) => {
      if (request.url !== '/healthz') { response.writeHead(404).end(); return; }
      const now = Date.now();
      const status = loops.map((l) => ({ ...l.stats, stale: l.stats.lastRunAt !== null && now - l.stats.lastRunAt > staleMs }));
      const healthy = status.every((s) => !s.stale && s.consecutiveFailures < 5);
      response.writeHead(healthy ? 200 : 503, { 'content-type': 'application/json' }).end(JSON.stringify({ healthy, loops: status }));
    })
    .listen(port, '127.0.0.1');
}
