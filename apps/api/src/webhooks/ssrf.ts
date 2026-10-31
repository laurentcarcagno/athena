import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

/** Vrai pour les adresses non publiques : boucle locale, privées, lien local (dont métadonnées cloud), CGNAT, etc. */
export function isPrivateAddress(address: string): boolean {
  if (net.isIPv6(address)) {
    const lower = address.toLowerCase();
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return lower === '::1' || lower === '::' || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower);
  }
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p as [number, number, number, number];
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || a >= 224
  );
}

export interface PostOptions {
  allowPrivate?: boolean;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface PostResult {
  status: number;
  body: string;
}

/**
 * POST sans redirection, avec contrôle SSRF à la résolution DNS de la connexion
 * (empêche le rebinding : l'adresse validée est celle utilisée).
 */
export function safePost(url: string, headers: Record<string, string>, body: string, options: PostOptions = {}): Promise<PostResult> {
  const target = new URL(url);
  if (target.protocol !== 'https:' && !(options.allowPrivate && target.protocol === 'http:')) {
    return Promise.reject(new Error('HTTPS obligatoire'));
  }
  // Une adresse IP littérale ne passe pas par la résolution DNS : on la contrôle explicitement.
  const literal = target.hostname.replace(/^\[|\]$/g, '');
  if (!options.allowPrivate && net.isIP(literal) && isPrivateAddress(literal)) {
    return Promise.reject(new Error('Destination non publique refusée (SSRF)'));
  }
  const transport = target.protocol === 'https:' ? https : http;
  const lookup: net.LookupFunction = (hostname, lookupOptions, callback) => {
    dns.lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
      if (error) return (callback as (e: Error | null) => void)(error);
      const list = addresses as dns.LookupAddress[];
      if (!options.allowPrivate && list.some((a) => isPrivateAddress(a.address))) {
        return (callback as (e: Error | null) => void)(new Error('Destination non publique refusée (SSRF)'));
      }
      const first = list[0]!;
      if ((lookupOptions as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, [first]);
      return callback(null, first.address, first.family);
    });
  };
  return new Promise((resolve, reject) => {
    const request = transport.request(
      target,
      { method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, lookup, timeout: options.timeoutMs ?? 10_000 },
      (response) => {
        const limit = options.maxResponseBytes ?? 64 * 1024;
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size <= limit) chunks.push(chunk);
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    request.on('timeout', () => request.destroy(new Error('Délai dépassé')));
    request.on('error', reject);
    request.end(body);
  });
}
