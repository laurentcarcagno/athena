import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { EgressError, installNoEgress, isAllowedHost, type EgressGuard } from './no-egress';

// Le garde global (no-egress-setup) est déjà actif : on l'imbrique pour observer ses effets sans polluer la consignation globale.
let guard: EgressGuard | undefined;
afterEach(() => { guard?.take(); guard?.uninstall(); guard = undefined; });

const fails = async (p: Promise<unknown> | (() => unknown)) => {
  try { await (typeof p === 'function' ? p() : p); return null; } catch (e) { return e as Error; }
};

describe('liste d’autorisation', () => {
  it('autorise le local et les hôtes internes configurés, refuse le reste', () => {
    for (const h of ['localhost', '127.0.0.1', '127.9.9.9', '::1', '[::1]', 'api.localhost', undefined]) expect(isAllowedHost(h), String(h)).toBe(true);
    for (const h of ['example.com', '8.8.8.8', 'fonts.googleapis.com', '10.0.0.5', 'keycloak.interne.lan']) expect(isAllowedHost(h), h).toBe(false);
    expect(isAllowedHost('keycloak.interne.lan', ['keycloak.interne.lan'])).toBe(true);
    expect(isAllowedHost('gitlab.interne.lan', ['.interne.lan'])).toBe(true);
    expect(isAllowedHost('evil-interne.lan', ['.interne.lan'])).toBe(false);
  });
});

describe('garde de sortie réseau', () => {
  it('refuse et consigne une connexion TCP vers un hôte public', async () => {
    guard = installNoEgress();
    const error = await fails(() => net.connect({ host: '93.184.216.34', port: 443 }));
    expect(error).toBeInstanceOf(EgressError);
    expect(guard.violations).toEqual(['93.184.216.34 (net)']);
  });

  it('refuse http et https vers un hôte public, avant toute résolution de nom', async () => {
    guard = installNoEgress();
    expect(await fails(() => http.get('http://public-site.net/ping'))).toBeInstanceOf(EgressError);
    expect(await fails(() => https.request({ hostname: 'api.public-site.net', path: '/' }))).toBeInstanceOf(EgressError);
    expect(await fails(() => https.get(new URL('https://cdn.public-site.net/x.css')))).toBeInstanceOf(EgressError);
    expect(guard.take()).toEqual(['public-site.net (http)', 'api.public-site.net (https)', 'cdn.public-site.net (https)']);
  });

  it('refuse la résolution DNS d’un nom externe (callback et promesses)', async () => {
    guard = installNoEgress();
    const viaCallback = await new Promise<Error | null>((resolve) => dns.lookup('exfil.public-site.net', (e) => resolve(e)));
    expect(viaCallback).toBeInstanceOf(EgressError);
    expect(await fails(dns.promises.resolve4('exfil.public-site.net'))).toBeInstanceOf(EgressError);
    expect(guard.take()).toEqual(['exfil.public-site.net (dns)', 'exfil.public-site.net (dns)']);
  });

  it('laisse passer le local (serveur de test) et les hôtes internes configurés', async () => {
    guard = installNoEgress({ allowHosts: ['keycloak.interne.lan'] });
    const server = http.createServer((_q, r) => r.end('ok'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as net.AddressInfo).port;
    const body = await new Promise<string>((resolve, reject) => http.get({ host: '127.0.0.1', port }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d)); }).on('error', reject));
    server.close();
    expect(body).toBe('ok');
    expect(await fails(() => isAllowedHost('keycloak.interne.lan', ['keycloak.interne.lan']) || (() => { throw new Error('refusé'); })())).toBeNull();
    expect(guard.violations).toEqual([]);
  });

  it('un test qui avale l’erreur échoue quand même : assertClean lève (preuve : rouge sur un appel fictif vers un hôte public)', async () => {
    guard = installNoEgress();
    await fails(() => https.get('https://telemetrie.public-site.net/collect')); // appel fictif, erreur avalée par l’application
    expect(() => guard!.assertClean()).toThrow(/telemetrie\.public-site\.net/);
    guard.take();
    expect(() => guard!.assertClean()).not.toThrow();
  });

  it('se désinstalle proprement', async () => {
    const before = net.Socket.prototype.connect;
    guard = installNoEgress();
    expect(net.Socket.prototype.connect).not.toBe(before);
    guard.uninstall();
    expect(net.Socket.prototype.connect).toBe(before);
  });
});
