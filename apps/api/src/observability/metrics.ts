import { randomBytes } from 'node:crypto';

/**
 * Métriques au format texte Prometheus (plan § 10, observabilité) : compteurs et histogrammes en mémoire, sans dépendance.
 * Les étiquettes sont bornées par construction (méthode, route déclarée, classe de statut) : jamais d'identifiant ni de chemin brut.
 */
const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

const escape = (v: string) => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
const labelText = (labels: Record<string, string>) => {
  const keys = Object.keys(labels).sort();
  return keys.length ? `{${keys.map((k) => `${k}="${escape(labels[k]!)}"`).join(',')}}` : '';
};

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly histograms = new Map<string, { buckets: number[]; sum: number; count: number }>();
  private readonly maxSeries = 2_000;

  inc(name: string, labels: Record<string, string> = {}, by = 1): void {
    const key = `${name}${labelText(labels)}`;
    if (!this.counters.has(key) && this.counters.size >= this.maxSeries) return; // borne mémoire : une série de plus est ignorée
    this.counters.set(key, (this.counters.get(key) ?? 0) + by);
  }

  observe(name: string, seconds: number, labels: Record<string, string> = {}): void {
    const key = `${name}${labelText(labels)}`;
    let h = this.histograms.get(key);
    if (!h) {
      if (this.histograms.size >= this.maxSeries) return;
      h = { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
      this.histograms.set(key, h);
    }
    BUCKETS.forEach((upper, i) => { if (seconds <= upper) h!.buckets[i]! += 1; });
    h.sum += seconds;
    h.count += 1;
  }

  /** Texte de l'exposition Prometheus ; `gauges` : valeurs instantanées calculées à la lecture (file d'attente, échecs…). */
  render(gauges: Array<{ name: string; help: string; labels?: Record<string, string>; value: number }> = []): string {
    const out: string[] = [];
    const typed = new Set<string>();
    const head = (name: string, type: string, help: string) => { if (!typed.has(name)) { typed.add(name); out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`); } };
    for (const [key, value] of [...this.counters].sort()) {
      const name = key.replace(/\{.*$/, '');
      head(name, 'counter', 'Compteur Athena');
      out.push(`${key} ${value}`);
    }
    for (const [key, h] of [...this.histograms].sort()) {
      const name = key.replace(/\{.*$/, '');
      const base = key.slice(name.length);
      const inner = base ? base.slice(1, -1) : '';
      head(name, 'histogram', 'Durée en secondes');
      BUCKETS.forEach((upper, i) => out.push(`${name}_bucket{${inner}${inner ? ',' : ''}le="${upper}"} ${h.buckets[i]}`));
      out.push(`${name}_bucket{${inner}${inner ? ',' : ''}le="+Inf"} ${h.count}`, `${name}_sum${base} ${h.sum}`, `${name}_count${base} ${h.count}`);
    }
    for (const g of gauges) {
      head(g.name, 'gauge', g.help);
      out.push(`${g.name}${labelText(g.labels ?? {})} ${g.value}`);
    }
    return `${out.join('\n')}\n`;
  }
}

export const metrics = new MetricsRegistry();

const statusClass = (code: number) => `${Math.floor(code / 100)}xx`;
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/** Identifiant de trace W3C (`traceparent`) : repris de la requête s'il est valide, sinon généré ; la réponse le renvoie. */
export function traceContext(header: unknown): { traceId: string; spanId: string; traceparent: string } {
  const m = typeof header === 'string' ? TRACEPARENT.exec(header.trim()) : null;
  const traceId = m && m[1] !== '0'.repeat(32) ? m[1]! : randomBytes(16).toString('hex');
  const spanId = randomBytes(8).toString('hex');
  return { traceId, spanId, traceparent: `00-${traceId}-${spanId}-${m ? m[3] : '01'}` };
}

interface FastifyLike {
  addHook(name: 'onRequest', fn: (request: any, reply: any) => Promise<void>): void;
  addHook(name: 'onResponse', fn: (request: any, reply: any) => Promise<void>): void;
}

/** Mesure RED (débit, erreurs, durée) de chaque route et propagation de la trace. La route est le motif déclaré (`/v1/projects/:project`), jamais le chemin reçu. */
export function applyMetrics(fastify: FastifyLike, registry: MetricsRegistry = metrics): void {
  fastify.addHook('onRequest', async (request, reply) => {
    const trace = traceContext(request.headers?.['traceparent']);
    request.athenaTrace = trace;
    reply.header('traceparent', trace.traceparent);
    reply.header('X-Request-Id', trace.traceId);
  });
  fastify.addHook('onResponse', async (request, reply) => {
    const route = String(request.routeOptions?.url ?? request.routerPath ?? 'inconnue');
    if (route === '/metrics' || route === '/healthz') return;
    const labels = { method: String(request.method), route, status: statusClass(Number(reply.statusCode)) };
    registry.inc('athena_http_requests_total', labels);
    registry.observe('athena_http_request_duration_seconds', Number(reply.elapsedTime ?? 0) / 1000, { method: labels.method, route });
  });
}
