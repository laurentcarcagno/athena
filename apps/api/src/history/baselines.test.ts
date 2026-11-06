import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, fromEnv, pgUp, probe, type TestDb } from '../testing/harness';
import { BaselineService } from './baseline.service';
import { GitLabClient } from './gitlab-client';
import { HistorySync } from './history-sync';

const GITLAB_URL = fromEnv('GITLAB_TEST_URL') ?? 'http://127.0.0.1:8929';
const TOKEN = fromEnv('GITLAB_DEV_TOKEN');
const gitlabUp = !!TOKEN && probe("fetch(process.env.U+'/users/sign_in',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))", { U: GITLAB_URL });
const suite = pgUp && gitlabUp ? describe : describe.skip;
const alice: Actor = { id: 'sub-alice', roles: ['athena-user', 'athena-admin'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('tracker.yaml, restauration et baselines (GitLab réel)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let sync: HistorySync;
  let baselines: BaselineService;
  let gitlab: GitLabClient;
  let repoId: number;
  const org = crypto.randomUUID();
  const orgKey = `bl${Date.now().toString(36)}${process.pid.toString(36)}`;

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_baselines');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    gitlab = new GitLabClient(GITLAB_URL, TOKEN!);
    sync = new HistorySync(testDb.pool, gitlab, 'root');
    baselines = new BaselineService(testDb.pool, gitlab, 'root');
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, orgKey]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-alice','alice','Alice Martin','alice@example.test')", [org]);
    });
    await trackers.createProject(org, 'ARI', 'Ariane', alice);
    await trackers.createTracker(org, bugTemplate('ARI'), alice);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('commit la définition du tracker au nom de son auteur', async () => {
    expect(await sync.runOnce()).toEqual({ committed: 1, failed: 0 });
    repoId = await gitlab.ensureRepository('root', `athena-history-${orgKey}-ari`);
    const commits = await gitlab.commits(repoId, 'trackers/BUG/tracker.yaml', 'main');
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ author_name: 'Alice Martin', author_email: 'alice@example.test' });
    const def = parse(await gitlab.fileContent(repoId, 'trackers/BUG/tracker.yaml', 'main'));
    expect(def.key).toBe('BUG');
    expect(def.fields.map((f: { key: string }) => f.key)).toContain('severity');
    const start = def.transitions.find((t: { name: string }) => t.name === 'Démarrer');
    expect(start).toMatchObject({ from: 'open', to: 'in_progress' }); // identifiants remplacés par les clés de statut
  }, 60_000);

  it('restaure une révision antérieure par une nouvelle révision, sans réécrire l’historique', async () => {
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Version A', severity: 'mineure' }, alice);
    await artifacts.update(org, 'ARI', 'ARI-BUG-0001', { title: 'Version B', root_cause: 'cause' }, 1, alice);
    await artifacts.update(org, 'ARI', 'ARI-BUG-0001', { title: 'Version C' }, 2, alice);

    const restored = await artifacts.restore(org, 'ARI', 'ARI-BUG-0001', 1, 3, alice);
    expect(restored.version).toBe(4);
    expect(restored.values).toEqual({ title: 'Version A', severity: 'mineure' }); // root_cause retiré, comme à la révision 1
    expect(await code(artifacts.restore(org, 'ARI', 'ARI-BUG-0001', 99, 4, alice))).toMatch(/not_found/);
    expect(await code(artifacts.restore(org, 'ARI', 'ARI-BUG-0001', 1, 3, alice))).toMatch(/conflict/);

    await sync.runOnce();
    const commits = await gitlab.commits(repoId, 'trackers/BUG/artifacts/ARI-BUG-0001.yaml', 'main');
    expect(commits).toHaveLength(4); // création, 2 mises à jour, restauration : historique en ajout seul
    expect(parse(await gitlab.fileContent(repoId, 'trackers/BUG/artifacts/ARI-BUG-0001.yaml', 'main'))).toMatchObject({ version: 4, values: { title: 'Version A' } });
  }, 90_000);

  it('crée une baseline, tag Git couplé aux SHA documentaires', async () => {
    await testDb.exec("insert into doc_source (organization_id, project_id, name, git_sha) select $1, id, 'spec', 'abc1234def' from project where key = 'ARI'", [org]);
    const v1 = await baselines.create(org, 'ARI', 'v1.0', alice);
    expect(v1).toMatchObject({ name: 'v1.0', gitTag: 'baseline/v1.0', docShas: { spec: 'abc1234def' } });
    expect(v1.gitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(await code(baselines.create(org, 'ARI', 'v1.0', alice))).toMatch(/conflict.*existe déjà/);
    expect(await code(baselines.create(org, 'ARI', 'mauvais nom!', alice))).toMatch(/validation/);
    expect((await baselines.list(org, 'ARI')).map((b) => b.name)).toEqual(['v1.0']);
  }, 60_000);

  it('refuse une baseline tant que la synchronisation est en retard', async () => {
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Nouveau', severity: 'majeure' }, alice);
    expect(await code(baselines.create(org, 'ARI', 'v1.1', alice))).toMatch(/conflict.*en retard/);
  });

  it('compare deux baselines : artefacts créés et modifiés', async () => {
    await artifacts.update(org, 'ARI', 'ARI-BUG-0001', { severity: 'bloquante' }, 4, alice);
    await sync.runOnce();
    await baselines.create(org, 'ARI', 'v1.1', alice);
    const diff = await baselines.diff(org, 'ARI', 'v1.0', 'v1.1');
    expect(diff).toEqual({ created: ['ARI-BUG-0002'], modified: ['ARI-BUG-0001'], deleted: [], trackers: [] });
    expect(await code(baselines.diff(org, 'ARI', 'v1.0', 'inconnue'))).toMatch(/not_found/);
  }, 90_000);

  it('versionne les évolutions de configuration du tracker dans tracker.yaml', async () => {
    const db = new Db(testDb.pool);
    const trackers = new TrackerService(db, new FieldTypeRegistry());
    await trackers.addField(org, 'ARI', 'BUG', { key: 'environment', label: 'Environnement', type: 'text' }, alice);
    await trackers.addStatus(org, 'ARI', 'BUG', { key: 'wontfix', name: 'Abandonné', category: 'done' }, alice);
    await trackers.addTransition(org, 'ARI', 'BUG', { name: 'Abandonner', from: 'open', to: 'wontfix' }, alice);
    await sync.runOnce();
    const def = parse(await gitlab.fileContent(repoId, 'trackers/BUG/tracker.yaml', 'main'));
    expect(def.schemaVersion).toBe(4);
    expect(def.fields.map((f: { key: string }) => f.key)).toContain('environment');
    expect(def.transitions.find((t: { name: string }) => t.name === 'Abandonner')).toMatchObject({ from: 'open', to: 'wontfix' });
    const commits = await gitlab.commits(repoId, 'trackers/BUG/tracker.yaml', 'main');
    expect(commits[0]!.message).toContain('configuration (champ environment)'); // l'état courant est écrit dès le premier événement
    expect(commits[0]).toMatchObject({ author_name: 'Alice Martin' });
  }, 60_000);
});
