import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';

/**
 * Garde « aucune sortie » pour les tests : toute tentative de connexion (http, https, net, dns) vers un hôte qui n'est ni local ni
 * dans la liste d'autorisation échoue avec `EgressError`, et est consignée (un test qui avale l'erreur échoue quand même).
 * Les hôtes autorisés sont les hôtes internes configurés : option `allowHosts` et variable ATHENA_INTERNAL_HOSTS (liste séparée par
 * des virgules ; `.suffixe` autorise tout un domaine interne).
 */
export class EgressError extends Error {
  constructor(readonly host: string, readonly via: string) {
    super(`Sortie réseau interdite vers ${host} (${via}).`);
    this.name = 'EgressError';
  }
}

export interface EgressGuard {
  /** Tentatives refusées depuis l'installation (ou la dernière remise à zéro). */
  readonly violations: string[];
  /** Renvoie les tentatives consignées et les remet à zéro. */
  take(): string[];
  /** Lève une erreur si une tentative a été consignée. */
  assertClean(): void;
  uninstall(): void;
}

const LOOPBACK_V4 = /^127(\.\d{1,3}){3}$/;

export function isAllowedHost(host: string | undefined | null, allow: string[] = []): boolean {
  if (!host) return true; // connexion sans hôte (socket de domaine Unix, descripteur)
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0' || LOOPBACK_V4.test(h) || h.endsWith('.localhost')) return true;
  return allow.some((a) => (a.startsWith('.') ? h.endsWith(a.toLowerCase()) : h === a.toLowerCase()));
}

export const configuredHosts = (): string[] => (process.env['ATHENA_INTERNAL_HOSTS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** Hôte visé par les arguments variés de `net.Socket.connect`, `http.request` et `dns.lookup`. */
function hostOf(args: unknown[]): string | undefined {
  const first = args[0];
  if (first && typeof first === 'object') {
    const o = first as { host?: string; hostname?: string; path?: string; href?: string; port?: number };
    if (o.href && !o.host && !o.hostname) { try { return new URL(o.href).hostname; } catch { return undefined; } }
    if (o.path && !o.host && !o.hostname && typeof o.port !== 'number') return undefined;
    return o.hostname ?? o.host ?? 'localhost';
  }
  if (typeof first === 'string') {
    if (/^https?:\/\//i.test(first)) { try { return new URL(first).hostname; } catch { return first; } }
    return first;
  }
  if (typeof first === 'number') return typeof args[1] === 'string' ? (args[1] as string) : 'localhost';
  return undefined;
}

export function installNoEgress(options: { allowHosts?: string[] } = {}): EgressGuard {
  const allow = [...(options.allowHosts ?? []), ...configuredHosts()];
  const violations: string[] = [];
  const restore: Array<() => void> = [];
  const check = (host: string | undefined, via: string): void => {
    if (isAllowedHost(host, allow)) return;
    violations.push(`${host} (${via})`);
    throw new EgressError(String(host), via);
  };
  const patch = <T extends object, K extends keyof T>(target: T, key: K, wrap: (original: T[K]) => T[K]) => {
    const original = target[key];
    target[key] = wrap(original);
    restore.push(() => { target[key] = original; });
  };

  // net : couvre http, https, tls et les clients de bases de données
  patch(net.Socket.prototype, 'connect', (original) => function (this: net.Socket, ...args: unknown[]) {
    check(hostOf(args.flat()), 'net');
    return (original as (...a: unknown[]) => net.Socket).apply(this, args);
  } as typeof net.Socket.prototype.connect);
  // http / https : refus avant même la résolution
  for (const [mod, name] of [[http, 'http'], [https, 'https']] as const) {
    for (const fn of ['request', 'get'] as const) {
      patch(mod as unknown as Record<string, unknown>, fn, (original) => ((...args: unknown[]) => {
        const target = args[0];
        let host: string | undefined;
        if (typeof target === 'string' || target instanceof URL) { try { host = new URL(String(target)).hostname; } catch { host = String(target); } } else host = hostOf([target]);
        check(host, name);
        return (original as (...a: unknown[]) => unknown)(...args);
      }) as never);
    }
  }
  // dns : aucune résolution de nom externe (la fuite par requête DNS est aussi une sortie)
  patch(dns, 'lookup', (original) => ((host: string, ...rest: unknown[]) => {
    const cb = rest[rest.length - 1];
    if (!isAllowedHost(host, allow)) {
      violations.push(`${host} (dns)`);
      const err = new EgressError(host, 'dns');
      if (typeof cb === 'function') { process.nextTick(() => (cb as (e: Error) => void)(err)); return {} as never; }
      throw err;
    }
    return (original as (...a: unknown[]) => unknown)(host, ...rest);
  }) as never);
  for (const fn of ['lookup', 'resolve', 'resolve4', 'resolve6'] as const) {
    patch(dns.promises as unknown as Record<string, unknown>, fn, (original) => (async (host: string, ...rest: unknown[]) => {
      if (!isAllowedHost(host, allow)) { violations.push(`${host} (dns)`); throw new EgressError(host, 'dns'); }
      return (original as (...a: unknown[]) => Promise<unknown>)(host, ...rest);
    }) as never);
  }

  return {
    violations,
    take: () => violations.splice(0, violations.length),
    assertClean: () => { if (violations.length) throw new EgressError(violations.join(', '), 'consigné'); },
    uninstall: () => { while (restore.length) restore.pop()!(); },
  };
}
