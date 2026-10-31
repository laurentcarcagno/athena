import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, Pool } from 'pg';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { migrate } from '../db/migrate';
import { GitLabClient } from './gitlab-client';
import { HistorySync } from './history-sync';
import { artifactPath, serializeArtifact } from './serialize';

const envFile = (() => {
  try { return readFileSync(join(__dirname, '../../../../deploy/dev/.env'), 'utf8'); } catch { return ''; }
})();
const fromEnv = (name: string) => process.env[name] ?? new RegExp(`^${name}=(.+)$`, 'm').exec(envFile)?.[1]?.trim();
const POSTGRES_PASSWORD = fromEnv('POSTGRES_PASSWORD');
const ADMIN = process.env['ATHENA_TEST_ADMIN_URL'] ?? (POSTGRES_PASSWORD ? `postgres://athena:${encodeURIComponent(POSTGRES_PASSWORD)}@127.0.0.1:5432/postgres` : undefined);
const GITLAB_URL = fromEnv('GITLAB_TEST_URL') ?? 'http://127.0.0.1:8929';
const GITLAB_TOKEN = fromEnv('GITLAB_DEV_TOKEN');

const probe = (script: string, env: Record<string, string>) =>
  spawnSync(process.execPath, ['-e', script], { env: { ...process.env, ...env }, cwd: join(__dirname, '../..'), timeout: 8000 }).status === 0;
const pgUp = ADMIN !== undefined && probe("const {Client}=require('pg');const c=new Client({connectionString:process.env.U,connectionTimeoutMillis:1500});c.connect().then(()=>c.end()).then(()=>process.exit(0),()=>process.exit(1))", { U: ADMIN });
const gitlabUp = !!GITLAB_TOKEN && probe("fetch(process.env.U+'/users/sign_in',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))", { U: GITLAB_URL });
const suite = pgUp && gitlabUp ? describe : describe.skip;

describe('sérialisation déterministe', () => {
  const snapshot = { key: 'BUG-1', tracker: 'BUG', status: 'open', version: 3, values: { z: 1, a: 'x', m: ['b', 'a'] } };
  it('est stable et triée', () => {
    const a = serializeArtifact(snapshot);
    const b = serializeArtifact({ ...snapshot, values: { m: ['b', 'a'], a: 'x', z: 1 } });
    expect(a).toBe(b);
    expect(a.indexOf('a: x')).toBeLessThan(a.indexOf('z: 1'));
    expect(parse(a)).toMatchObject({ key: 'BUG-1', version: 3, values: { a: 'x' } });
  });
  it('place le fichier sous trackers/<tracker>/artifacts', () => {
    expect(artifactPath(snapshot)).toBe('trackers/BUG/artifacts/BUG-1.yaml');
  });
});

suite('historique GitLab (intégration)', () => {
  const DB = 'athena_test_history';
  const APP_USER = 'athena_app_history';
  const orgKey = `hist${Date.now().toString(36)}`;
  const org = crypto.randomUUID();
  const alice: Actor = { id: 'sub-alice', roles: ['athena-user', 'athena-admin'] };
  const bob: Actor = { id: 'sub-bob', roles: ['athena-user'] };
  let pool: Pool;
  let artifacts: ArtifactService;
  let sync: HistorySync;
  let gitlab: GitLabClient;
  let projectId: number;

  const withDb = (database: string, user?: string, password?: string) => {
    const url = new URL(ADMIN!);
    url.pathname = `/${database}`;
    if (user) { url.username = user; url.password = password ?? ''; }
    return url.toString();
  };

  beforeAll(async () => {
    const root = new Client({ connectionString: ADMIN });
    await root.connect();
    await root.query(`drop database if exists ${DB} with (force)`);
    await root.query(`create database ${DB}`);
    await root.end();
    await migrate(withDb(DB));
    const adminPool = new Pool({ connectionString: withDb(DB) });
    await adminPool.query(`drop role if exists ${APP_USER}`).catch(() => undefined);
    await adminPool.query(`create role ${APP_USER} login password 'history-test-only' nosuperuser nobypassrls in role athena_app`);
    await adminPool.end();
    pool = new Pool({ connectionString: withDb(DB, APP_USER, 'history-test-only'), max: 5 });
    const db = new Db(pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, orgKey]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-alice','alice','Alice Martin','alice@example.test'), ($1,'sub-bob','bob','Bob Durand','bob@example.test')", [org]);
    });
    await trackers.createProject(org, 'ARI', 'Ariane', alice);
    await trackers.createTracker(org, bugTemplate('ARI'), alice);
    gitlab = new GitLabClient(GITLAB_URL, GITLAB_TOKEN!);
    sync = new HistorySync(pool, gitlab, 'root');
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    const root = new Client({ connectionString: ADMIN });
    await root.connect();
    await root.query(`drop database if exists ${DB} with (force)`);
    await root.query(`drop role if exists ${APP_USER}`);
    await root.end();
  });

  it("écrit un commit par modification, avec l'utilisateur réel comme auteur", async () => {
    const created = await artifacts.create(org, 'ARI', 'BUG', { title: 'Crash', severity: 'majeure' }, alice);
    const updated = await artifacts.update(org, 'ARI', created.key, { assignee: 'sub-bob' }, 1, bob);
    await artifacts.transition(org, 'ARI', created.key, 'Démarrer', updated.version, bob);

    const result = await sync.runOnce();
    expect(result).toEqual({ committed: 3, failed: 0 });

    projectId = await gitlab.ensureRepository('root', `athena-history-${orgKey}-ari`);
    const path = 'trackers/BUG/artifacts/BUG-1.yaml';
    const commits = await gitlab.commits(projectId, path, 'main');
    expect(commits.length).toBe(3);
    // Plus récent en premier : transition (Bob), mise à jour (Bob), création (Alice).
    expect(commits.map((c) => c.author_name)).toEqual(['Bob Durand', 'Bob Durand', 'Alice Martin']);
    expect(commits.map((c) => c.author_email)).toEqual(['bob@example.test', 'bob@example.test', 'alice@example.test']);
    expect(commits[0]!.message).toContain('statut open → in_progress');
    expect(commits[0]!.message).toContain('Athena-Actor: sub-bob');
    expect(commits[0]!.committer_name).not.toBe('Bob Durand'); // committer = compte de service

    const stored = parse(await gitlab.fileContent(projectId, path, 'main'));
    expect(stored).toMatchObject({ key: 'BUG-1', status: 'in_progress', version: 3, values: { assignee: 'sub-bob', title: 'Crash' } });
  }, 60_000);

  it('enregistre le SHA du commit dans la révision', async () => {
    const rows = await new Db(pool).tx(org, (c) => c.query('select version, git_sha from artifact_revision order by version'));
    expect(rows.rows.every((r: { git_sha: string | null }) => /^[0-9a-f]{40}$/.test(r.git_sha ?? ''))).toBe(true);
  });

  it("est idempotent : un second passage ne recommit rien", async () => {
    expect(await sync.runOnce()).toEqual({ committed: 0, failed: 0 });
    const commits = await gitlab.commits(projectId, 'trackers/BUG/artifacts/BUG-1.yaml', 'main');
    expect(commits.length).toBe(3);
  });

  it('reprend après une panne GitLab sans perdre ni dupliquer', async () => {
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Second', severity: 'mineure' }, alice);
    const down = new HistorySync(pool, new GitLabClient('http://127.0.0.1:1', 'x'), 'root');
    const failed = await down.runOnce();
    expect(failed.failed).toBe(1);
    expect(failed.committed).toBe(0);
    expect(await sync.runOnce()).toEqual({ committed: 1, failed: 0 });
    const commits = await gitlab.commits(projectId, 'trackers/BUG/artifacts/BUG-2.yaml', 'main');
    expect(commits.length).toBe(1);
  }, 60_000);
});
