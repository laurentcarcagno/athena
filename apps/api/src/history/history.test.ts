import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, Pool } from 'pg';
import { parse } from 'yaml';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { AccessService } from '../core/access.service';
import { Db, type Actor } from '../core/db';
import { ExportMarker } from '../core/export-marking';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { migrate } from '../db/migrate';
import { ConfidentialFields } from '../secrets/confidential';
import { OpenBao } from '../secrets/openbao';
import { GitLabClient } from './gitlab-client';
import { HistorySync } from './history-sync';
import { RebuildService } from './rebuild';
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
const BAO_ADDR = fromEnv('OPENBAO_TEST_ADDR') ?? 'http://127.0.0.1:8200';
const BAO_TOKEN = fromEnv('BAO_DEV_ROOT_TOKEN');
const baoUp = !!BAO_TOKEN && probe("fetch(process.env.U+'/v1/sys/health',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.status<500?0:1),()=>process.exit(1))", { U: BAO_ADDR });
const suite = pgUp && gitlabUp ? describe : describe.skip;

describe('sérialisation déterministe', () => {
  const snapshot = { key: 'ARI-BUG-0001', tracker: 'BUG', status: 'open', version: 3, values: { z: 1, a: 'x', m: ['b', 'a'] } };
  it('est stable et triée', () => {
    const a = serializeArtifact(snapshot);
    const b = serializeArtifact({ ...snapshot, values: { m: ['b', 'a'], a: 'x', z: 1 } });
    expect(a).toBe(b);
    expect(a.indexOf('a: x')).toBeLessThan(a.indexOf('z: 1'));
    expect(parse(a)).toMatchObject({ key: 'ARI-BUG-0001', version: 3, values: { a: 'x' } });
  });
  it('place le fichier sous trackers/<tracker>/artifacts', () => {
    expect(artifactPath(snapshot)).toBe('trackers/BUG/artifacts/ARI-BUG-0001.yaml');
  });
});

suite('historique GitLab (intégration)', () => {
  // Noms uniques par processus (voir core-http.test.ts).
  const DB = `athena_test_history_${process.pid.toString(36)}`;
  const APP_USER = `athena_app_history_${process.pid.toString(36)}`;
  const orgKey = `hist${Date.now().toString(36)}${process.pid.toString(36)}`;
  const org = crypto.randomUUID();
  const alice: Actor = { id: 'sub-alice', roles: ['athena-team-member', 'athena-admin'] };
  const bob: Actor = { id: 'sub-bob', roles: ['athena-team-member'] };
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
    expect(result).toEqual({ committed: 4, failed: 0 }); // tracker.yaml + 3 révisions de l'artefact

    projectId = await gitlab.ensureRepository('root', `athena-history-${orgKey}-ari`);
    const path = 'trackers/BUG/artifacts/ARI-BUG-0001.yaml';
    const commits = await gitlab.commits(projectId, path, 'main');
    expect(commits.length).toBe(3);
    // Plus récent en premier : transition (Bob), mise à jour (Bob), création (Alice).
    expect(commits.map((c) => c.author_name)).toEqual(['Bob Durand', 'Bob Durand', 'Alice Martin']);
    expect(commits.map((c) => c.author_email)).toEqual(['bob@example.test', 'bob@example.test', 'alice@example.test']);
    expect(commits[0]!.message).toContain('statut open → in_progress');
    expect(commits[0]!.message).toContain('Athena-Actor: sub-bob');
    expect(commits[0]!.committer_name).not.toBe('Bob Durand'); // committer = compte de service

    const stored = parse(await gitlab.fileContent(projectId, path, 'main'));
    expect(stored).toMatchObject({ key: 'ARI-BUG-0001', status: 'in_progress', version: 3, values: { assignee: 'sub-bob', title: 'Crash' } });
  }, 60_000);

  it('enregistre le SHA du commit dans la révision', async () => {
    const rows = await new Db(pool).tx(org, (c) => c.query('select version, git_sha from artifact_revision order by version'));
    expect(rows.rows.every((r: { git_sha: string | null }) => /^[0-9a-f]{40}$/.test(r.git_sha ?? ''))).toBe(true);
  });

  it("est idempotent : un second passage ne recommit rien", async () => {
    expect(await sync.runOnce()).toEqual({ committed: 0, failed: 0 });
    const commits = await gitlab.commits(projectId, 'trackers/BUG/artifacts/ARI-BUG-0001.yaml', 'main');
    expect(commits.length).toBe(3);
  });

  it('reprend après une panne GitLab sans perdre ni dupliquer', async () => {
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Second', severity: 'mineure' }, alice);
    const down = new HistorySync(pool, new GitLabClient('http://127.0.0.1:1', 'x'), 'root');
    const failed = await down.runOnce();
    expect(failed.failed).toBe(1);
    expect(failed.committed).toBe(0);
    expect(await sync.runOnce()).toEqual({ committed: 1, failed: 0 });
    const commits = await gitlab.commits(projectId, 'trackers/BUG/artifacts/ARI-BUG-0002.yaml', 'main');
    expect(commits.length).toBe(1);
  }, 60_000);

  it.runIf(baoUp)('chiffre les champs confidentiels avant de les écrire dans Git', async () => {
    const db = new Db(pool);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    await trackers.createTracker(org, {
      projectKey: 'ARI', key: 'SEC', name: 'Sécurité',
      fields: [
        { key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' },
        { key: 'note', label: 'Note', type: 'richtext', config: { confidential: true } },
      ],
      statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }],
      transitions: [],
    }, alice);
    await artifacts.create(org, 'ARI', 'SEC', { title: 'Visible', note: 'Mot de passe du coffre-fort' }, alice);
    const bao = new OpenBao(BAO_ADDR, BAO_TOKEN!);
    const secured = new HistorySync(pool, gitlab, 'root', 'main', new ConfidentialFields(bao));
    expect(await secured.runOnce()).toEqual({ committed: 2, failed: 0 }); // tracker.yaml + artefact

    const raw = await gitlab.fileContent(projectId, 'trackers/SEC/artifacts/ARI-SEC-0001.yaml', 'main');
    expect(raw).toContain('Visible');
    expect(raw).not.toContain('coffre-fort');
    const stored = parse(raw) as { values: Record<string, unknown> };
    expect(String(stored.values['note'])).toMatch(/^bao:v1:vault:v1:/);
    const revealed = await new ConfidentialFields(bao).reveal(orgKey, stored.values);
    expect(revealed['note']).toBe('Mot de passe du coffre-fort');
  }, 60_000);

  it.runIf(baoUp)('item sous contrôle export : Git ne reçoit ni titre ni contenu en clair, avec la mention de protection ; la reconstruction les retrouve', async () => {
    const db = new Db(pool);
    const access = new AccessService(db);
    await db.tx(org, (c) => c.query("insert into export_control_member (organization_id, project_id, subject, added_by) select organization_id, id, 'sub-alice', 'sub-alice' from project where key = 'ARI' on conflict do nothing"));
    const secret = await artifacts.create(org, 'ARI', 'SEC', { title: 'Titre ITAR confidentiel', note: 'Contenu sensible' }, alice);
    await access.setMarking(org, 'ARI', secret.key, 'ITAR', alice);
    await new TrackerService(db, new FieldTypeRegistry()).addField(org, 'ARI', 'SEC', { key: 'extra', label: 'Extra', type: 'text' }, alice); // un nouveau commit de tracker.yaml, sous mention
    const bao = new OpenBao(BAO_ADDR, BAO_TOKEN!);
    const protectedSync = new HistorySync(pool, gitlab, 'root', 'main', new ConfidentialFields(bao), new ExportMarker('Diffusion Restreinte'));
    await protectedSync.runOnce();
    const path = `trackers/SEC/artifacts/${secret.key}.yaml`;
    const raw = await gitlab.fileContent(projectId, path, 'main');
    expect(raw.startsWith('# Diffusion Restreinte\n')).toBe(true);
    expect(raw.trimEnd().endsWith('# Diffusion Restreinte')).toBe(true);
    expect(raw).not.toContain('Titre ITAR confidentiel');
    expect(raw).not.toContain('Contenu sensible');
    const stored = parse(raw) as { exportControl: string; masked?: boolean; values: Record<string, unknown> };
    expect(stored).toMatchObject({ exportControl: 'ITAR' });
    expect(stored.masked).toBeUndefined();
    expect(String(stored.values['title'])).toMatch(/^bao:v1:vault:v1:/);
    expect(await new ConfidentialFields(bao).reveal(orgKey, stored.values)).toMatchObject({ title: 'Titre ITAR confidentiel', note: 'Contenu sensible' });
    // les fichiers générés par Athena portent aussi la mention : tracker.yaml
    expect((await gitlab.fileContent(projectId, 'trackers/SEC/tracker.yaml', 'main')).startsWith('# Diffusion Restreinte\n')).toBe(true);
    // sans OpenBao, les valeurs sont retirées plutôt qu'écrites en clair
    const second = await artifacts.create(org, 'ARI', 'SEC', { title: 'Autre titre ITAR', note: 'Autre contenu' }, alice);
    await access.setMarking(org, 'ARI', second.key, 'EAR', alice);
    await new HistorySync(pool, gitlab, 'root', 'main').runOnce();
    const masked = await gitlab.fileContent(projectId, `trackers/SEC/artifacts/${second.key}.yaml`, 'main');
    expect(masked).not.toContain('Autre titre ITAR');
    expect(parse(masked)).toMatchObject({ exportControl: 'EAR', masked: true, values: {} });
    // la reconstruction depuis Git rétablit le marquage et déchiffre le contenu
    const other = crypto.randomUUID();
    await db.tx(other, (c) => c.query("insert into organization (id, key, name) values ($1, 'hist-rebuilt', 'hist-rebuilt')", [other]));
    await db.tx(other, (c) => c.query("insert into user_account (organization_id, subject, username, display_name) values ($1,'sub-alice','alice','Alice')", [other]));
    await new TrackerService(db, new FieldTypeRegistry()).createProject(other, 'ARI', 'Reconstruit', alice);
    await new RebuildService(pool, gitlab, 'root', new ConfidentialFields(bao)).rebuild(other, 'ARI', orgKey, 'sub-alice');
    const rebuilt = await db.tx(other, async (c) => (await c.query("select a.export_control, a.\"values\" as values from artifact a where a.\"values\"->>'title' = 'Titre ITAR confidentiel'")).rows, { system: true });
    expect(rebuilt).toEqual([{ export_control: 'ITAR', values: expect.objectContaining({ title: 'Titre ITAR confidentiel', note: 'Contenu sensible' }) }]);
    // démarqué, l'item revient en clair au commit suivant
    await access.setMarking(org, 'ARI', second.key, null, alice);
    await new HistorySync(pool, gitlab, 'root', 'main').runOnce();
    expect(parse(await gitlab.fileContent(projectId, `trackers/SEC/artifacts/${second.key}.yaml`, 'main'))).toMatchObject({ values: { title: 'Autre titre ITAR' } });
  }, 90_000);

  it('mode « merge request » : les commits vont sur une branche de revue avec une MR ouverte, la fusion les intègre à main', async () => {
    const db = new Db(pool);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    await trackers.createTracker(org, {
      projectKey: 'ARI', key: 'REV', name: 'Revue',
      fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }],
      statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [],
    }, alice);
    await trackers.setHistoryMode(org, 'ARI', 'REV', 'merge_request', alice);
    const created = await artifacts.create(org, 'ARI', 'REV', { title: 'Soumis à revue' }, alice);
    await artifacts.update(org, 'ARI', created.key, { title: 'Soumis à revue (v2)' }, 1, alice);
    expect((await sync.runOnce()).failed).toBe(0);

    const path = `trackers/REV/artifacts/${created.key}.yaml`;
    expect(await gitlab.fileExists(projectId, path, 'main')).toBe(false); // rien sur la branche principale
    const branch = 'athena/review/REV';
    expect(parse(await gitlab.fileContent(projectId, path, branch))).toMatchObject({ version: 2, values: { title: 'Soumis à revue (v2)' } });
    const mr = await gitlab.openMergeRequest(projectId, branch, 'main');
    expect(mr).not.toBeNull();
    await sync.runOnce(); // un passage de plus ne crée pas de seconde MR
    expect((await gitlab.openMergeRequest(projectId, branch, 'main'))!.iid).toBe(mr!.iid);

    await gitlab.mergeMergeRequest(projectId, mr!.iid);
    // GitLab fusionne de façon asynchrone : on attend l'arrivée du fichier sur main (jusqu'à 30 s) plutôt qu'un délai fixe, qui échouait sous charge.
    for (let i = 0; i < 60 && !(await gitlab.fileExists(projectId, path, 'main')); i++) await new Promise((resolve) => setTimeout(resolve, 500));
    expect(parse(await gitlab.fileContent(projectId, path, 'main'))).toMatchObject({ version: 2 });
    // Les trackers en mode direct continuent d'écrire sur main.
    const direct = await artifacts.create(org, 'ARI', 'BUG', { title: 'Direct', severity: 'mineure' }, alice);
    await sync.runOnce();
    expect(await gitlab.fileExists(projectId, `trackers/BUG/artifacts/${direct.key}.yaml`, 'main')).toBe(true);
  }, 90_000);
});
