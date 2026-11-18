// Écrit le contrat OpenAPI complet de l'API dans un fichier : node tools/dump-openapi.mjs docs/api/openapi.json
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? 'docs/api/openapi.json');
const run = spawnSync('npx', ['vitest', 'run', 'src/openapi/dump.test.ts'], { cwd: join(root, 'apps/api'), env: { ...process.env, OPENAPI_OUT: out }, stdio: 'inherit', shell: true });
process.exit(run.status ?? 1);
