import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const saved = join(here, '.admin-required-actions.json');

/** Rend à admin.dev les actions requises (TOTP) retirées par global-setup.mjs : le compte de développement reste conforme. */
export default async function globalTeardown() {
  if (!existsSync(saved)) return;
  const { id, requiredActions } = JSON.parse(readFileSync(saved, 'utf8'));
  const env = readFileSync(join(here, '../deploy/dev/.env'), 'utf8');
  const base = 'http://localhost:8080';
  const form = new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: /^KEYCLOAK_ADMIN=(.+)$/m.exec(env)[1].trim(), password: /^KEYCLOAK_ADMIN_PASSWORD=(.+)$/m.exec(env)[1].trim() });
  const token = (await (await fetch(`${base}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: form })).json()).access_token;
  const res = await fetch(`${base}/admin/realms/athena/users/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ requiredActions }) });
  if (!res.ok) throw new Error(`Keycloak : restauration de admin.dev impossible (${res.status})`);
  unlinkSync(saved);
}
