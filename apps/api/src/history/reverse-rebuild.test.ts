import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, fromEnv, pgUp, probe, type TestDb } from '../testing/harness';
import { GitLabClient } from './gitlab-client';
import { HistorySync } from './history-sync';
import { RebuildService } from './rebuild';
import { ReverseSync } from './reverse-sync';

const GITLAB_URL = fromEnv('GITLAB_TEST_URL') ?? 'http://127.0.0.1:8929';
const TOKEN = fromEnv('GITLAB_DEV_TOKEN');
const gitlabUp = !!TOKEN && probe("fetch(process.env.U+'/users/sign_in',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))", { U: GITLAB_URL });
const suite = pgUp && gitlabUp ? describe : describe.skip;
const alice: Actor = { id: 'sub-alice', roles: ['athena-user', 'athena-admin'] };

suite('synchronisation inverse et reconstruction (GitLab réel)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let sync: HistorySync;
  let reverse: ReverseSync;
  let rebuild: RebuildService;
  let gitlab: GitLabClient;
  let repo: number;
  const org = crypto.randomUUID();
  const orgKey = `rv${Date.now().toString(36)}`;
  const path = (key: string) => `trackers/BUG/artifacts/${key}.yaml`;

  /** Simule un commit fait par un humain directement dans GitLab, et le webhook push correspondant. */
  async function externalEdit(key: string, edit: (doc: { values: Record<string, unknown>; status: string }) => void, email = 'bob@example.test') {
    const doc = parse(await gitlab.fileContent(repo, path(key), 'main'));
    edit(doc);
    const id = await gitlab.commit(repo, { branch: 'main', message: `Édition manuelle de ${key}`, authorName: 'Bob', authorEmail: email, actions: [{ action: 'update', file_path: path(key), content: stringify(doc) }] });
    return { commits: [{ id, message: `Édition manuelle de ${key}`, author: { email }, modified: [path(key)] }] };
  }

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_reverse');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    gitlab = new GitLabClient(GITLAB_URL, TOKEN!);
    sync = new HistorySync(testDb.pool, gitlab, 'root');
    reverse = new ReverseSync(testDb.pool, gitlab, 'root', artifacts);
    rebuild = new RebuildService(testDb.pool, gitlab, 'root');
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, orgKey]);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-alice','alice','Alice Martin','alice@example.test'), ($1,'sub-bob','bob','Bob Durand','bob@example.test')", [org]);
    });
    await trackers.createProject(org, 'ARI', 'Ariane', alice);
    await trackers.createTracker(org, bugTemplate('ARI'), alice);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Premier', severity: 'majeure' }, alice);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Second', severity: 'mineure' }, alice);
    await artifacts.update(org, 'ARI', 'BUG-2', { assignee: 'sub-bob' }, 1, alice);
    await sync.runOnce();
    repo = await gitlab.ensureRepository('root', `athena-history-${orgKey}-ari`);
  }, 90_000);
  afterAll(async () => { await testDb?.drop(); });

  it('importe une édition faite dans Git sous l’identité de son auteur, sans écho', async () => {
    const push = await externalEdit('BUG-1', (d) => { d.values['title'] = 'Titre corrigé dans Git'; });
    const [result] = await reverse.handlePush(org, 'ARI', push);
    expect(result).toMatchObject({ outcome: 'imported' });
    const art = await artifacts.get(org, 'ARI', 'BUG-1');
    expect(art.values['title']).toBe('Titre corrigé dans Git');
    expect(art.version).toBe(2);
    const rev = await new Db(testDb.pool).tx(org, (c) => c.query("select r.actor, r.git_sha from artifact_revision r join artifact a on a.id = r.artifact_id where a.key = 'BUG-1' and r.version = 2"));
    expect(rev.rows[0]).toMatchObject({ actor: 'sub-bob', git_sha: push.commits[0]!.id });
    expect(await sync.runOnce()).toEqual({ committed: 0, failed: 0 }); // l'événement est déjà couvert : pas de commit d'écho
    const commits = await gitlab.commits(repo, path('BUG-1'), 'main');
    expect(commits[0]!.message).toContain('normalisé'); // Athena remet le fichier sous forme canonique (version à jour)
    expect(parse(await gitlab.fileContent(repo, path('BUG-1'), 'main')).version).toBe(2);
  }, 60_000);

  it('est idempotent et ignore les commits d’Athena', async () => {
    const push = await externalEdit('BUG-1', (d) => { d.values['title'] = 'Autre titre'; });
    expect((await reverse.handlePush(org, 'ARI', push))[0]).toMatchObject({ outcome: 'imported' });
    expect((await reverse.handlePush(org, 'ARI', push))[0]).toMatchObject({ outcome: 'ignored', reason: 'commit déjà importé' });
    const own = await gitlab.commits(repo, path('BUG-2'), 'main');
    const athena = { commits: [{ id: own[0]!.id, message: own[0]!.message, author: { email: 'alice@example.test' }, modified: [path('BUG-2')] }] };
    expect((await reverse.handlePush(org, 'ARI', athena))[0]).toMatchObject({ outcome: 'ignored', reason: "commit d'Athena" });
  }, 60_000);

  it('rejette auteur inconnu, valeur invalide et artefact inconnu', async () => {
    const unknown = await externalEdit('BUG-1', (d) => { d.values['title'] = 'Par un inconnu'; }, 'inconnu@example.test');
    expect((await reverse.handlePush(org, 'ARI', unknown))[0]).toMatchObject({ outcome: 'rejected', reason: expect.stringContaining('auteur inconnu') });
    const invalid = await externalEdit('BUG-1', (d) => { d.values['severity'] = 'catastrophique'; });
    expect((await reverse.handlePush(org, 'ARI', invalid))[0]).toMatchObject({ outcome: 'rejected', reason: expect.stringContaining('hors liste') });
    expect((await artifacts.get(org, 'ARI', 'BUG-1')).values['severity']).toBe('majeure');
    // Git est rétabli à l'état validé par un commit d'Athena.
    const restored = parse(await gitlab.fileContent(repo, path('BUG-1'), 'main'));
    expect(restored.values).toMatchObject({ severity: 'majeure' });
    expect(restored.values.title).not.toBe('Par un inconnu');
    expect((await gitlab.commits(repo, path('BUG-1'), 'main'))[0]!.message).toContain("rétablit l'état validé");
    const ghost = { commits: [{ id: 'f'.repeat(40), message: 'x', author: { email: 'bob@example.test' }, modified: [path('BUG-77')] }] };
    expect((await reverse.handlePush(org, 'ARI', ghost))[0]).toMatchObject({ outcome: 'rejected', reason: expect.stringContaining('inconnu') });
    expect((await reverse.handlePush(org, 'ARI', { commits: [{ id: 'a'.repeat(40), message: 'x', modified: ['README.md'] }] }))[0]).toMatchObject({ outcome: 'ignored' });
  }, 60_000);

  it('n’importe que les valeurs : un changement de statut dans le fichier est ignoré', async () => {
    const push = await externalEdit('BUG-1', (d) => { d.status = 'delivered'; d.values['title'] = 'Statut forcé'; });
    expect((await reverse.handlePush(org, 'ARI', push))[0]).toMatchObject({ outcome: 'imported' });
    expect((await artifacts.get(org, 'ARI', 'BUG-1')).status).toBe('open');
  }, 60_000);

  it('signale un conflit quand Athena a des modifications pas encore écrites dans Git', async () => {
    const push = await externalEdit('BUG-2', (d) => { d.values['title'] = 'Édition Git'; });
    const current = await artifacts.get(org, 'ARI', 'BUG-2');
    await artifacts.update(org, 'ARI', 'BUG-2', { title: 'Édition Athena' }, current.version, alice);
    expect((await reverse.handlePush(org, 'ARI', push))[0]).toMatchObject({ outcome: 'conflict' });
    expect((await artifacts.get(org, 'ARI', 'BUG-2')).values['title']).toBe('Édition Athena'); // rien n'est écrasé
    await sync.runOnce();
  }, 60_000);

  it('reconstruit un projet vide depuis Git avec le même contenu, et reprend la numérotation', async () => {
    const other = crypto.randomUUID();
    const db = new Db(testDb.pool);
    await db.tx(other, (c) => c.query("insert into organization (id, key, name) values ($1,'copie','Copie')", [other]));
    await new TrackerService(db, new FieldTypeRegistry()).createProject(other, 'ARI', 'Ariane', alice);

    const result = await rebuild.rebuild(other, 'ARI', orgKey, 'rebuild');
    expect(result).toEqual({ trackers: 1, artifacts: 2 });

    const dump = (o: string) => db.tx(o, async (c) => ({
      artifacts: (await c.query(`select a.key, s.key as status, a."values" as values from artifact a join status s on s.id = a.status_id order by a.number`)).rows,
      fields: (await c.query('select key, type, required, semantic_role from field_definition order by key')).rows,
      transitions: (await c.query('select name from transition order by name')).rows,
    }));
    expect(await dump(other)).toEqual(await dump(org));

    const copyArtifacts = new ArtifactService(db, new TrackerService(db, new FieldTypeRegistry()), new FieldTypeRegistry());
    const next = await copyArtifacts.create(other, 'ARI', 'BUG', { title: 'Après reconstruction', severity: 'mineure' }, alice);
    expect(next.key).toBe('BUG-3');
    await expect(rebuild.rebuild(other, 'ARI', orgKey, 'rebuild')).rejects.toBeInstanceOf(DomainError);
  }, 90_000);
});
