/** Limiteur à fenêtre fixe en mémoire. Par instance : derrière plusieurs instances, la limite s'applique à chacune. */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 20_000,
  ) {}

  hit(key: string, now: number = Date.now()): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    let entry = this.windows.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      if (this.windows.size >= this.maxKeys) this.evict(now);
      entry = { start: now, count: 0 };
      this.windows.set(key, entry);
    }
    entry.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.start + this.windowMs - now) / 1000));
    return { allowed: entry.count <= this.limit, remaining: Math.max(0, this.limit - entry.count), retryAfterSeconds };
  }

  /** Purge des fenêtres expirées ; en dernier recours, vide la table (bornes mémoire contre les attaques par clés multiples). */
  private evict(now: number): void {
    for (const [key, entry] of this.windows) if (now - entry.start >= this.windowMs) this.windows.delete(key);
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}

export interface HardeningOptions {
  /** Requêtes par minute et par client pour l'API. */
  apiPerMinute: number;
  /** Requêtes par minute et par client pour /auth et /hooks (authentification, webhooks entrants). */
  sensitivePerMinute: number;
  hsts: boolean;
  /** Niveau de protection de l'instance, reporté dans l'en-tête X-Athena-Protection-Level de chaque réponse. */
  protectionLevel?: string;
}

interface FastifyLike {
  addHook(name: 'onRequest', fn: (request: any, reply: any) => Promise<void>): void;
  addHook(name: 'onSend', fn: (request: any, reply: any, payload: unknown) => Promise<unknown>): void;
}

const bucketOf = (url: string): 'sensitive' | 'api' | 'none' => {
  if (url === '/healthz') return 'none';
  return url.startsWith('/auth') || url.startsWith('/hooks') ? 'sensitive' : 'api';
};

/** En-têtes de sécurité sur toutes les réponses et limitation de débit par client et par catégorie de route. */
export function applyHardening(fastify: FastifyLike, options: HardeningOptions, now: () => number = Date.now): { api: RateLimiter; sensitive: RateLimiter } {
  const api = new RateLimiter(options.apiPerMinute, 60_000);
  const sensitive = new RateLimiter(options.sensitivePerMinute, 60_000);

  fastify.addHook('onRequest', async (request, reply) => {
    const bucket = bucketOf(String(request.url).split('?')[0] ?? '');
    if (bucket === 'none') return;
    const result = (bucket === 'sensitive' ? sensitive : api).hit(`${request.ip}`, now());
    reply.header('RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      reply.header('Retry-After', String(result.retryAfterSeconds));
      reply.code(429).send({ error: 'rate_limited', message: 'Trop de requêtes. Réessayez plus tard.', details: [] });
    }
  });

  fastify.addHook('onSend', async (_request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    // Une route peut poser sa propre politique (fichier servi en bac à sable, image mise en cache) : elle est gardée et
    // complétée de frame-ancestors ; sinon la politique par défaut s'applique.
    if (!reply.getHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    const own = reply.getHeader('Content-Security-Policy');
    reply.header('Content-Security-Policy', own ? `${String(own)}; frame-ancestors 'none'` : "default-src 'none'; frame-ancestors 'none'");
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if (options.hsts) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (options.protectionLevel) reply.header('X-Athena-Protection-Level', options.protectionLevel.replace(/[^\x20-\x7E]/g, '?'));
    return payload;
  });
  return { api, sensitive };
}
