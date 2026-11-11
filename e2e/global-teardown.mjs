import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const saved = join(here, '.admin-required-actions.json');

/** Rend à admin.dev les actions requises (TOTP) retirées par global-setup.mjs : le compte de développement reste conforme. */
export default async function globalTeardown() {
  if (!existsSync(saved)) return;
  const { id, requiredActions, otp = [] } = JSON.parse(readFileSync(saved, 'utf8'));
  const env = readFileSync(join(here, '../deploy/dev/.env'), 'utf8');
  const base = 'http://localhost:8080';
  const form = new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: /^KEYCLOAK_ADMIN=(.+)$/m.exec(env)[1].trim(), password: /^KEYCLOAK_ADMIN_PASSWORD=(.+)$/m.exec(env)[1].trim() });
  const token = (await (await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: form })).json()).access_token;
  const res = await fetch(`${base}/admin/realms/athena/users/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requiredActions }) });
  if (!res.ok) throw new Error(`Keycloak : restauration de admin.dev impossible (${res.status})`);
  // Étape OTP du flux de connexion, désactivée par global-setup.mjs quand le compte a un TOTP enregistré (lot 11).
  if (otp.length) {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const realm = await (await fetch(`${base}/admin/realms/athena`, { headers })).json();
    for (const { id: execution, flow: name = realm.browserFlow, requirement } of otp) {
      const flow = encodeURIComponent(name);
      const executions = await (await fetch(`${base}/admin/realms/athena/authentication/flows/${flow}/executions`, { headers })).json();
      const current = executions.find((e) => e.id === execution);
      if (!current) continue;
      const r = await fetch(`${base}/admin/realms/athena/authentication/flows/${flow}/executions`, { method: 'PUT', headers, body: JSON.stringify({ ...current, requirement }) });
      if (!r.ok) throw new Error(`Keycloak : restauration de l'étape OTP impossible (${r.status})`);
    }
  }
  unlinkSync(saved);
}
