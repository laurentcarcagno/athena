import { Pool } from 'pg';
import { z } from 'zod';
import { GitLabClient } from './history/gitlab-client';
import { HistorySync } from './history/history-sync';
import { ConfidentialFields } from './secrets/confidential';
import { OpenBao } from './secrets/openbao';

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    GITLAB_URL: z.string().url(),
    GITLAB_TOKEN: z.string().min(10),
    GITLAB_NAMESPACE: z.string().min(1),
    OPENBAO_ADDR: z.string().url().optional(),
    OPENBAO_TOKEN: z.string().min(1).optional(),
    HISTORY_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
  })
  .parse(process.env);

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 4 });
if (!env.OPENBAO_ADDR || !env.OPENBAO_TOKEN) {
  console.warn('history-sync: OpenBao non configuré, les champs confidentiels ne seraient pas chiffrés.');
  if (process.env['NODE_ENV'] === 'production') throw new Error('OPENBAO_ADDR et OPENBAO_TOKEN sont obligatoires en production');
}
const confidential =
  env.OPENBAO_ADDR && env.OPENBAO_TOKEN ? new ConfidentialFields(new OpenBao(env.OPENBAO_ADDR, env.OPENBAO_TOKEN)) : undefined;
const sync = new HistorySync(pool, new GitLabClient(env.GITLAB_URL, env.GITLAB_TOKEN), env.GITLAB_NAMESPACE, 'main', confidential);

let stopping = false;
async function loop(): Promise<void> {
  while (!stopping) {
    try {
      const { committed, failed } = await sync.runOnce();
      if (committed || failed) console.log(`history-sync: ${committed} commit(s), ${failed} échec(s)`);
    } catch (error) {
      console.error(`history-sync: ${(error as Error).message.slice(0, 200)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, env.HISTORY_INTERVAL_MS));
  }
  await pool.end();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { stopping = true; });
void loop();
