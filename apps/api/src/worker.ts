import { Pool } from 'pg';
import { z } from 'zod';
import { GitLabClient } from './history/gitlab-client';
import { HistorySync } from './history/history-sync';

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    GITLAB_URL: z.string().url(),
    GITLAB_TOKEN: z.string().min(10),
    GITLAB_NAMESPACE: z.string().min(1),
    HISTORY_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
  })
  .parse(process.env);

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 4 });
const sync = new HistorySync(pool, new GitLabClient(env.GITLAB_URL, env.GITLAB_TOKEN), env.GITLAB_NAMESPACE);

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
