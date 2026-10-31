import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit } from '../core/tracker.service';
import { sign } from './signing';
import { safePost } from './ssrf';

/** Stockage des secrets de signature. En production : OpenBao KV. */
export interface SecretStore {
  put(path: string, data: Record<string, string>): Promise<void>;
  get(path: string): Promise<Record<string, string> | null>;
}

export interface WebhookOptions {
  allowPrivate: boolean;
  maxAttempts: number;
  /** Délai avant la tentative n (1-indexée), en millisecondes. */
  backoffMs: (attempt: number) => number;
  disableAfterFailures: number;
}

export const defaultOptions: WebhookOptions = {
  allowPrivate: false,
  maxAttempts: 6,
  backoffMs: (attempt) => [60_000, 300_000, 1_800_000, 7_200_000, 21_600_000, 86_400_000][attempt - 1] ?? 86_400_000,
  disableAfterFailures: 20,
};

export interface EndpointView {
  id: string;
  url: string;
  eventTypes: string[];
  active: boolean;
  description: string;
}

export interface DeliveryView {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
}

export const matches = (patterns: string[], type: string): boolean =>
  patterns.some((p) => p === '*' || p === type || (p.endsWith('.*') && type.startsWith(p.slice(0, -1))));

export class WebhookService {
  private readonly options: WebhookOptions;

  constructor(
    private readonly pool: Pool,
    private readonly secrets: SecretStore,
    options: Partial<WebhookOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  private get db(): Db {
    return new Db(this.pool);
  }

  /** Crée un abonnement. Le secret n'est retourné qu'une seule fois. */
  async createEndpoint(
    organizationId: string, input: { url: string; eventTypes: string[]; description?: string }, actor: Actor,
  ): Promise<{ endpoint: EndpointView; secret: string }> {
    const problems: string[] = [];
    let parsed: URL | undefined;
    try { parsed = new URL(input.url); } catch { problems.push('url invalide'); }
    if (parsed && parsed.protocol !== 'https:' && !(this.options.allowPrivate && parsed.protocol === 'http:')) problems.push('HTTPS obligatoire');
    if (parsed && (parsed.username || parsed.password)) problems.push("identifiants dans l'URL interdits");
    if (input.eventTypes.length === 0 || input.eventTypes.some((t) => !/^(\*|[a-z_]+(\.[a-z_]+)*(\.\*)?)$/.test(t))) problems.push("types d'événements invalides");
    if (problems.length) throw validation(problems);

    const secret = `whsec_${randomBytes(32).toString('hex')}`;
    const id = await this.db.tx(organizationId, async (c) => {
      const row = (
        await c.query(
          'insert into webhook_endpoint (organization_id, url, event_types, description, created_by) values ($1,$2,$3,$4,$5) returning id',
          [organizationId, input.url, input.eventTypes, input.description ?? '', actor.id],
        )
      ).rows[0];
      await audit(c, organizationId, actor, 'webhook.create', `webhook:${row.id}`, { url: input.url });
      return row.id as string;
    });
    await this.secrets.put(secretPath(organizationId, id), { secret });
    return { endpoint: { id, url: input.url, eventTypes: input.eventTypes, active: true, description: input.description ?? '' }, secret };
  }

  async listEndpoints(organizationId: string): Promise<EndpointView[]> {
    return this.db.tx(organizationId, async (c) =>
      (await c.query('select id, url, event_types, active, description from webhook_endpoint order by created_at')).rows.map((r) => ({
        id: r.id, url: r.url, eventTypes: r.event_types, active: r.active, description: r.description,
      })),
    );
  }

  async deliveries(organizationId: string, endpointId: string): Promise<DeliveryView[]> {
    return this.db.tx(organizationId, async (c) =>
      (await c.query('select id, event_type, status, attempts, last_status, last_error from webhook_delivery where endpoint_id = $1 order by created_at, id', [endpointId])).rows.map((r) => ({
        id: r.id, eventType: r.event_type, status: r.status, attempts: r.attempts, lastStatus: r.last_status, lastError: r.last_error,
      })),
    );
  }

  async setActive(organizationId: string, endpointId: string, active: boolean, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query('update webhook_endpoint set active = $2, consecutive_failures = 0 where id = $1', [endpointId, active]);
      if (result.rowCount === 0) throw notFound('Abonnement');
      await audit(c, organizationId, actor, active ? 'webhook.enable' : 'webhook.disable', `webhook:${endpointId}`);
    });
  }

  /** Rejoue une livraison (échec ou succès) : nouvelle tentative immédiate. */
  async replay(organizationId: string, deliveryId: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query(
        "update webhook_delivery set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null where id = $1",
        [deliveryId],
      );
      if (result.rowCount === 0) throw notFound('Livraison');
      await audit(c, organizationId, actor, 'webhook.replay', `delivery:${deliveryId}`);
    });
  }

  /** Transforme les événements de l'outbox en livraisons en attente. */
  async enqueue(organizationId: string, batch = 200): Promise<number> {
    return this.db.tx(organizationId, async (c) => {
      const org = (await c.query('select key from organization')).rows[0].key as string;
      const endpoints = (await c.query('select id, event_types from webhook_endpoint where active')).rows as Array<{ id: string; event_types: string[] }>;
      const events = (
        await c.query('select id, type, payload, created_at, aggregate_id from outbox_event where published_at is null order by created_at, id limit $1 for update skip locked', [batch])
      ).rows;
      let queued = 0;
      for (const event of events) {
        const body = JSON.stringify({
          id: event.id, type: event.type, version: '1', occurredAt: event.created_at.toISOString(), organization: org, data: event.payload,
        });
        for (const endpoint of endpoints.filter((e) => matches(e.event_types, event.type))) {
          await c.query(
            'insert into webhook_delivery (organization_id, endpoint_id, event_id, event_type, body) values ($1,$2,$3,$4,$5) on conflict do nothing',
            [organizationId, endpoint.id, event.id, event.type, body],
          );
          queued += 1;
        }
        await c.query('update outbox_event set published_at = now() where id = $1', [event.id]);
      }
      return queued;
    });
  }

  /** Envoie les livraisons échues. Retourne le nombre de livraisons réussies et échouées (définitivement). */
  async deliverDue(organizationId: string, batch = 50): Promise<{ delivered: number; retried: number; failed: number }> {
    const summary = { delivered: 0, retried: 0, failed: 0 };
    const due = await this.db.tx(organizationId, async (c) =>
      (
        await c.query(
          `select d.id, d.endpoint_id, d.event_id, d.event_type, d.body, d.attempts, e.url
           from webhook_delivery d join webhook_endpoint e on e.id = d.endpoint_id
           where d.status = 'pending' and d.next_attempt_at <= now() and e.active
           order by d.next_attempt_at, d.id limit $1`,
          [batch],
        )
      ).rows as Array<{ id: string; endpoint_id: string; event_id: string; event_type: string; body: string; attempts: number; url: string }>,
    );
    for (const d of due) {
      const secret = (await this.secrets.get(secretPath(organizationId, d.endpoint_id)))?.['secret'];
      let status = 0;
      let error: string | null = null;
      try {
        if (!secret) throw new Error('secret de signature introuvable');
        const result = await safePost(
          d.url,
          {
            'Content-Type': 'application/json',
            'User-Agent': 'Athena-Webhooks/1',
            'Athena-Event-Id': d.event_id,
            'Athena-Event-Type': d.event_type,
            'Athena-Signature': sign(secret, d.body),
          },
          d.body,
          { allowPrivate: this.options.allowPrivate },
        );
        status = result.status;
        if (status < 200 || status >= 300) error = `HTTP ${status}`;
      } catch (e) {
        error = (e as Error).message.slice(0, 200);
      }
      const attempts = d.attempts + 1;
      await this.db.tx(organizationId, async (c) => {
        if (error === null) {
          await c.query("update webhook_delivery set status='delivered', attempts=$2, last_status=$3, last_error=null, delivered_at=now() where id=$1", [d.id, attempts, status]);
          await c.query('update webhook_endpoint set consecutive_failures = 0 where id = $1', [d.endpoint_id]);
          summary.delivered += 1;
        } else if (attempts >= this.options.maxAttempts) {
          await c.query("update webhook_delivery set status='failed', attempts=$2, last_status=$3, last_error=$4 where id=$1", [d.id, attempts, status || null, error]);
          await c.query('update webhook_endpoint set consecutive_failures = consecutive_failures + 1, active = (consecutive_failures + 1 < $2) where id = $1', [d.endpoint_id, this.options.disableAfterFailures]);
          summary.failed += 1;
        } else {
          await c.query("update webhook_delivery set attempts=$2, last_status=$3, last_error=$4, next_attempt_at = now() + ($5 || ' milliseconds')::interval where id=$1", [d.id, attempts, status || null, error, String(this.options.backoffMs(attempts))]);
          summary.retried += 1;
        }
      });
    }
    return summary;
  }
}

const secretPath = (organizationId: string, endpointId: string) => `athena/${organizationId}/webhooks/${endpointId}`;
