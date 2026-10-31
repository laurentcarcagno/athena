// Mesure de charge concurrente de l'API (jeton Keycloak de développement, base e2e déjà migrée et amorcée).
// Prérequis : infra de dev démarrée, `pnpm --filter @athena/e2e test` exécuté au moins une fois (base athena_e2e),
// puis API lancée avec les variables de e2e/playwright.config.ts sur le port 3001.
// Usage : node tools/load-test.mjs [--seed 50000] [--seconds 15] [--levels 10,50,200]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../apps/api/package.json'));
const { Client } = require('pg');
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const seed = Number(arg('seed', '0'));
const seconds = Number(arg('seconds', '15'));
const levels = arg('levels', '10,50,200').split(',').map(Number);
const api = arg('api', 'http://127.0.0.1:3001');

if (seed > 0) {
  const env = readFileSync(join(here, '../deploy/dev/.env'), 'utf8');
  const pw = /^POSTGRES_PASSWORD=(.+)$/m.exec(env)[1].trim();
  const c = new Client({ connectionString: `postgres://athena:${encodeURIComponent(pw)}@127.0.0.1:5432/athena_e2e` });
  await c.connect();
  await c.query("select set_config('app.org_id', (select id::text from organization where key = 'demo'), false)");
  await c.query(`insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", created_by, created_at, updated_at)
    select t.organization_id, t.project_id, t.id, 1000 + g, 'BUG-' || (1000 + g), (select id from status s where s.tracker_id = t.id order by s.position offset (g % 2) limit 1),
           jsonb_build_object('title', 'Charge ' || g, 'severity', (array['mineure','majeure','bloquante'])[1 + g % 3]), 'load', now() - (g || ' minutes')::interval, now()
    from tracker t, generate_series(1, ${seed}) g where t.key = 'BUG' on conflict do nothing`);
  await c.end();
  console.log(`amorçage : ${seed} artefacts`);
}

const form = new URLSearchParams({ grant_type: 'password', client_id: 'athena-dev-cli', username: 'user.dev', password: 'dev-only-user' });
const token = (await (await fetch('http://localhost:8080/realms/athena/protocol/openid-connect/token', { method: 'POST', body: form })).json()).access_token;
if (!token) throw new Error('jeton Keycloak indisponible');
const headers = { Authorization: `Bearer ${token}` };

const scenarios = [
  ['liste (50 premiers)', '/v1/projects/ARI/search?q=&limit=50'],
  ['recherche ATQL', '/v1/projects/ARI/search?q=' + encodeURIComponent('severity = majeure AND status = open ORDER BY updated DESC') + '&limit=50'],
  ['fiche artefact', '/v1/projects/ARI/artifacts/BUG-1'],
];
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

for (const [name, path] of scenarios) {
  for (const level of levels) {
    const latencies = [];
    let errors = 0;
    const stopAt = Date.now() + seconds * 1000;
    await Promise.all(Array.from({ length: level }, async () => {
      while (Date.now() < stopAt) {
        const t = performance.now();
        try {
          const r = await fetch(api + path, { headers });
          await r.arrayBuffer();
          if (!r.ok) errors++;
        } catch { errors++; }
        latencies.push(performance.now() - t);
      }
    }));
    latencies.sort((a, b) => a - b);
    console.log(`${name.padEnd(22)} ${String(level).padStart(4)} conn.  ${String(Math.round(latencies.length / seconds)).padStart(6)} req/s  p50 ${Math.round(pct(latencies, 0.5))} ms  p95 ${Math.round(pct(latencies, 0.95))} ms  p99 ${Math.round(pct(latencies, 0.99))} ms  erreurs ${errors}`);
  }
}
