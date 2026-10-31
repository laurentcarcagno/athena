import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './migrate';

// Tests d'intégration PostgreSQL. Base jetable `athena_test`, créée sur l'instance de dev.
function adminUrl(): string | undefined {
  if (process.env['ATHENA_TEST_ADMIN_URL']) return process.env['ATHENA_TEST_ADMIN_URL'];
  try {
    const env = readFileSync(join(__dirname, '../../../../deploy/dev/.env'), 'utf8');
    const password = /^POSTGRES_PASSWORD=(.+)$/m.exec(env)?.[1];
    if (password) return `postgres://athena:${encodeURIComponent(password.trim())}@127.0.0.1:5432/postgres`;
  } catch {
    /* pas de fichier .env de dev */
  }
  return undefined;
}

const ADMIN = adminUrl();
// Sonde synchrone (pas de await de niveau supérieur : le code est compilé en CommonJS).
const reachable =
  ADMIN !== undefined &&
  spawnSync(
    process.execPath,
    ['-e', "const {Client}=require('pg');const c=new Client({connectionString:process.env.PROBE_URL,connectionTimeoutMillis:1500});c.connect().then(()=>c.end()).then(()=>process.exit(0),()=>process.exit(1))"],
    { env: { ...process.env, PROBE_URL: ADMIN }, cwd: join(__dirname, '../..'), timeout: 5000 },
  ).status === 0;
if (!reachable && process.env['CI']) throw new Error('PostgreSQL requis en CI');
const suite = reachable ? describe : describe.skip;

const DB = 'athena_test';
const APP_USER = 'athena_app_test';
const APP_PASSWORD = 'test-only-app-role';

function urlFor(base: string, database: string, user?: string, password?: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user;
    url.password = password ?? '';
  }
  return url.toString();
}

suite('persistance PostgreSQL', () => {
  let pool: Pool;
  let adminDb: string;
  const orgA = crypto.randomUUID();
  const orgB = crypto.randomUUID();

  /** Exécute `fn` dans une transaction avec l'organisation courante positionnée (RLS). */
  async function asOrg<T>(org: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('app.org_id', $1, true)", [org]);
      const value = await fn(client);
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    const admin = new Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`drop database if exists ${DB} with (force)`);
    await admin.query(`create database ${DB}`);
    await admin.end();
    adminDb = urlFor(ADMIN!, DB);
    await migrate(adminDb);

    const db = new Client({ connectionString: adminDb });
    await db.connect();
    await db.query(`drop role if exists ${APP_USER}`).catch(() => undefined);
    await db.query(`create role ${APP_USER} login password '${APP_PASSWORD}' nosuperuser nobypassrls in role athena_app`);
    await db.end();
    pool = new Pool({ connectionString: urlFor(ADMIN!, DB, APP_USER, APP_PASSWORD), max: 10 });

    for (const [id, key] of [[orgA, 'org-a'], [orgB, 'org-b']] as const) {
      await asOrg(id, (c) => c.query('insert into organization (id, key, name) values ($1, $2, $2)', [id, key]));
    }
  });

  afterAll(async () => {
    await pool?.end();
    const admin = new Client({ connectionString: ADMIN });
    await admin.connect();
    await admin.query(`drop database if exists ${DB} with (force)`);
    await admin.query(`drop role if exists ${APP_USER}`);
    await admin.end();
  });

  it('les migrations sont idempotentes et contrôlées par somme de contrôle', async () => {
    const again = await migrate(adminDb);
    expect(again.applied).toEqual([]);
    expect(again.skipped.length).toBeGreaterThanOrEqual(3);
  });

  it('isole les organisations par RLS', async () => {
    await asOrg(orgA, (c) => c.query("insert into project (organization_id, key, name) values ($1, 'ARI', 'Ariane')", [orgA]));
    const seenByB = await asOrg(orgB, (c) => c.query('select * from project'));
    expect(seenByB.rowCount).toBe(0);
    const seenByA = await asOrg(orgA, (c) => c.query('select * from project'));
    expect(seenByA.rowCount).toBe(1);
  });

  it("refuse l'écriture dans une autre organisation", async () => {
    await expect(
      asOrg(orgB, (c) => c.query("insert into project (organization_id, key, name) values ($1, 'HAK', 'x')", [orgA])),
    ).rejects.toThrow(/row-level security/);
  });

  it("sans organisation positionnée, rien n'est visible", async () => {
    const client = await pool.connect();
    try {
      expect((await client.query('select * from project')).rowCount).toBe(0);
    } finally {
      client.release();
    }
  });

  it('autorise plusieurs trackers par projet, clés uniques et valides', async () => {
    await asOrg(orgA, async (c) => {
      const project = (await c.query("select id from project where key='ARI'")).rows[0].id;
      for (const key of ['BUG', 'REQ', 'STORY', 'TEST']) {
        await c.query('insert into tracker (organization_id, project_id, key, name) values ($1,$2,$3,$3)', [orgA, project, key]);
      }
      expect((await c.query('select count(*)::int n from tracker where project_id=$1', [project])).rows[0].n).toBe(4);
    });
    await expect(
      asOrg(orgA, async (c) => {
        const project = (await c.query("select id from project where key='ARI'")).rows[0].id;
        await c.query("insert into tracker (organization_id, project_id, key, name) values ($1,$2,'BUG','dup')", [orgA, project]);
      }),
    ).rejects.toThrow(/duplicate key/);
    await expect(
      asOrg(orgA, async (c) => {
        const project = (await c.query("select id from project where key='ARI'")).rows[0].id;
        await c.query("insert into tracker (organization_id, project_id, key, name) values ($1,$2,'bad key','x')", [orgA, project]);
      }),
    ).rejects.toThrow(/check constraint/);
  });

  it("un seul champ par rôle sémantique dans un tracker", async () => {
    await expect(
      asOrg(orgA, async (c) => {
        const t = (await c.query("select id from tracker where key='BUG'")).rows[0].id;
        for (const key of ['titre', 'resume']) {
          await c.query("insert into field_definition (organization_id, tracker_id, key, label, type, semantic_role) values ($1,$2,$3,$3,'text','title')", [orgA, t, key]);
        }
      }),
    ).rejects.toThrow(/field_semantic_unique/);
  });

  it('numérote les artefacts par tracker sans doublon sous concurrence', async () => {
    const tracker = await asOrg(orgA, async (c) => (await c.query("select id from tracker where key='REQ'")).rows[0].id);
    const numbers = await Promise.all(
      Array.from({ length: 25 }, () =>
        asOrg(orgA, async (c) => Number((await c.query('select next_artifact_number($1) n', [tracker])).rows[0].n)),
      ),
    );
    expect(new Set(numbers).size).toBe(25);
    expect(Math.min(...numbers)).toBe(1);
    expect(Math.max(...numbers)).toBe(25);
  });

  it('crée un artefact avec révision et événement outbox dans une transaction', async () => {
    await asOrg(orgA, async (c) => {
      const t = (await c.query("select t.id, t.project_id from tracker t where key='BUG'")).rows[0];
      const status = (await c.query("insert into status (organization_id, tracker_id, key, name, category) values ($1,$2,'open','Ouvert','todo') returning id", [orgA, t.id])).rows[0].id;
      const n = (await c.query('select next_artifact_number($1) n', [t.id])).rows[0].n;
      const artifact = (await c.query(
        `insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", created_by)
         values ($1,$2,$3,$4,$5,$6,'{"title":"Fuite mémoire"}','u1') returning id`,
        [orgA, t.project_id, t.id, n, `BUG-${n}`, status],
      )).rows[0].id;
      await c.query("insert into artifact_revision (organization_id, artifact_id, version, diff, actor) values ($1,$2,1,'{}','u1')", [orgA, artifact]);
      await c.query("insert into outbox_event (organization_id, aggregate_type, aggregate_id, type, payload) values ($1,'artifact',$2,'artifact.created','{}')", [orgA, artifact]);
      const found = await c.query(`select key from artifact where "values" @> '{"title":"Fuite mémoire"}'`);
      expect(found.rows[0].key).toBe('BUG-1');
    });
  });

  it("le journal d'audit est chaîné et en ajout seul", async () => {
    await asOrg(orgA, async (c) => {
      for (const action of ['tracker.create', 'artifact.update', 'tracker.update']) {
        await c.query("insert into audit_log (organization_id, actor, action, target) values ($1,'u1',$2,'x')", [orgA, action]);
      }
      const rows = (await c.query('select prev_hash, hash from audit_log order by seq')).rows;
      expect(rows[0].prev_hash).toBeNull();
      expect(rows[1].prev_hash).toBe(rows[0].hash);
      expect(rows[2].prev_hash).toBe(rows[1].hash);
      expect(new Set(rows.map((r: { hash: string }) => r.hash)).size).toBe(3);
    });
    await expect(asOrg(orgA, (c) => c.query("update audit_log set actor='x'"))).rejects.toThrow(/permission denied|ajout seul/);
    await expect(asOrg(orgA, (c) => c.query('delete from audit_log'))).rejects.toThrow(/permission denied|ajout seul/);
  });
});
