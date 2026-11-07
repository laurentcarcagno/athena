import { ExportMarker } from './core/export-marking';
import { Pool } from 'pg';
import { z } from 'zod';
import { SearchService } from './atql/search.service';
import { AutomationService } from './automation/automation.service';
import { ArtifactService } from './core/artifact.service';
import { Db } from './core/db';
import { FieldTypeRegistry } from './core/field-types';
import { LinkService } from './core/link.service';
import { TrackerService } from './core/tracker.service';
import { GitLabClient } from './history/gitlab-client';
import { HistorySync } from './history/history-sync';
import { ConfidentialFields } from './secrets/confidential';
import { OpenBao } from './secrets/openbao';
import { OpenBaoSecretStore } from './secrets/store';
import { WebhookService } from './webhooks/webhook.service';
import { PluginService } from './plugins/plugin.service';
import { parseTrust } from './plugins/trust';
import { DigestService } from './notify/digest';
import { mailerFrom } from './notify/mailer-config';
import { buildWorkers, healthServer } from './workers/tasks';

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    GITLAB_URL: z.string().url().optional(),
    GITLAB_TOKEN: z.string().min(10).optional(),
    GITLAB_NAMESPACE: z.string().min(1).optional(),
    OPENBAO_ADDR: z.string().url().optional(),
    OPENBAO_TOKEN: z.string().min(1).optional(),
    WEBHOOK_ALLOW_PRIVATE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
    HISTORY_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
    WEBHOOKS_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
    SESSIONS_INTERVAL_MS: z.coerce.number().int().min(10_000).default(600_000),
    PLUGIN_TRUSTED_KEYS: z.string().optional(),
    ATHENA_PROTECTION_LEVEL: z.string().trim().max(80).default(''),
    WORKER_HEALTH_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
    PUBLIC_URL: z.string().url().default('http://localhost:3000'),
    SMTP_HOST: z.string().trim().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(25),
    SMTP_SECURITY: z.enum(['none', 'starttls', 'tls']).default('starttls'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().trim().optional(),
    SMTP_CA_FILE: z.string().optional(),
    DIGEST_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
    DIGEST_INTERVAL_MS: z.coerce.number().int().min(10_000).default(300_000),
  })
  .parse(process.env);

const log = (message: string) => console.log(`${new Date().toISOString()} ${message}`);
const production = process.env['NODE_ENV'] === 'production';
const pool = new Pool({ connectionString: env.DATABASE_URL, max: 6 });

const bao = env.OPENBAO_ADDR && env.OPENBAO_TOKEN ? new OpenBao(env.OPENBAO_ADDR, env.OPENBAO_TOKEN) : null;
if (!bao) {
  log('OpenBao non configuré : champs confidentiels non chiffrés, webhooks sortants désactivés.');
  if (production) throw new Error('OPENBAO_ADDR et OPENBAO_TOKEN sont obligatoires en production');
}

const history =
  env.GITLAB_URL && env.GITLAB_TOKEN && env.GITLAB_NAMESPACE
    ? new HistorySync(pool, new GitLabClient(env.GITLAB_URL, env.GITLAB_TOKEN), env.GITLAB_NAMESPACE, 'main', bao ? new ConfidentialFields(bao) : undefined, new ExportMarker(env.ATHENA_PROTECTION_LEVEL))
    : undefined;
if (!history) log("GitLab non configuré : synchronisation de l'historique désactivée.");
const webhooks = bao ? new WebhookService(pool, new OpenBaoSecretStore(bao), { allowPrivate: env.WEBHOOK_ALLOW_PRIVATE }) : undefined;

const db = new Db(pool);
const registry = new FieldTypeRegistry(); // types natifs : les types de champ de plugin ne sont pas chargés dans le worker
const artifactService = new ArtifactService(db, new TrackerService(db, registry), registry);
const automation = new AutomationService(db, artifactService, new LinkService(db), new SearchService(db));

const plugins = new PluginService(db, registry, parseTrust(env.PLUGIN_TRUSTED_KEYS), { read: async () => null });

const mailer = mailerFrom(env);
const digest = mailer ? new DigestService(db, { mailer, baseUrl: env.PUBLIC_URL, available: true }) : undefined;
if (!digest) log('Résumé quotidien désactivé : SMTP non configuré (ou DIGEST_ENABLED=false) ; aucune connexion de messagerie ne sera ouverte.');

const loops = buildWorkers(
  { pool, ...(digest ? { digest } : {}), ...(history ? { history } : {}), ...(webhooks ? { webhooks } : {}), automation, plugins, log },
  { historyMs: env.HISTORY_INTERVAL_MS, webhooksMs: env.WEBHOOKS_INTERVAL_MS, sessionsMs: env.SESSIONS_INTERVAL_MS, digestMs: env.DIGEST_INTERVAL_MS },
);
const health = healthServer(loops, env.WORKER_HEALTH_PORT);
for (const loop of loops) loop.start();
log(`worker démarré : ${loops.map((l) => l.name).join(', ')} (santé : :${env.WORKER_HEALTH_PORT}/healthz)`);

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  log(`${signal} reçu : arrêt en cours…`);
  await Promise.all(loops.map((l) => l.stop()));
  plugins.shutdown();
  health.close();
  await pool.end();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void shutdown(signal));
