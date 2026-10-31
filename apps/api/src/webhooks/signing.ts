import { createHmac, timingSafeEqual } from 'node:crypto';

/** En-tête `Athena-Signature: t=<secondes>,v1=<hex>` ; HMAC-SHA256 de `<t>.<corps>` (plan § 7.1). */
export function sign(secret: string, body: string, now: Date = new Date()): string {
  const t = Math.floor(now.getTime() / 1000);
  const mac = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return `t=${t},v1=${mac}`;
}

/** Vérification côté destinataire : comparaison en temps constant et tolérance anti-rejeu. */
export function verify(secret: string, header: string, body: string, toleranceSeconds = 300, now: Date = new Date()): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=', 2) as [string, string]));
  const t = Number(parts['t']);
  const given = parts['v1'];
  if (!Number.isInteger(t) || !given) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest();
  const actual = Buffer.from(given, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
