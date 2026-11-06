import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { GitCodeService } from './gitcode.service';
import { branchName, extractKeyActions, keysFromBranch } from './refs';

describe('extraction des références', () => {
  it('reconnaît mots-clés, listes et clés simples', () => {
    expect(extractKeyActions('Fixes ARI-BUG-0001, ARI-BUG-0002 et ARI-REQ-0003\n\nVoir aussi INC-9')).toEqual([
      { key: 'ARI-BUG-0001', action: 'fixes' }, { key: 'ARI-BUG-0002', action: 'fixes' }, { key: 'ARI-REQ-0003', action: 'fixes' }, { key: 'INC-9', action: 'refs' },
    ]);
    expect(extractKeyActions('closes: ARI-BUG-0007')).toEqual([{ key: 'ARI-BUG-0007', action: 'closes' }]);
    expect(extractKeyActions('Implements ARI-REQ-0004')).toEqual([{ key: 'ARI-REQ-0004', action: 'implements' }]);
    expect(extractKeyActions('Reverts ARI-BUG-0005')).toEqual([{ key: 'ARI-BUG-0005', action: 'reverts' }]);
    expect(extractKeyActions('refs ARI-BUG-0001')).toEqual([{ key: 'ARI-BUG-0001', action: 'refs' }]);
  });
  it('lit les deux formats sans extraire l’ancienne clé à l’intérieur de la nouvelle', () => {
    expect(extractKeyActions('Fixes SAT1-BUG-0012, REQ-3 et SAT1-REQ-0042')).toEqual([
      { key: 'SAT1-BUG-0012', action: 'fixes' }, { key: 'REQ-3', action: 'fixes' }, { key: 'SAT1-REQ-0042', action: 'fixes' },
    ]);
    expect(extractKeyActions('Voir SAT1-TSK-0108')).toEqual([{ key: 'SAT1-TSK-0108', action: 'refs' }]);
    expect(keysFromBranch('bugfix/SAT1-BUG-0012-resume')).toEqual(['SAT1-BUG-0012']);
    expect(branchName('feature', 'SAT1-REQ-0042', 'Journal système')).toBe('feature/SAT1-REQ-0042-journal-systeme');
  });
  it('ignore ce qui ne ressemble pas à une clé', () => {
    expect(extractKeyActions('utf-8 et sha-256, bug-12, X-1, ABC-')).toEqual([]);
  });
  it('borne le nombre de clés et la taille du texte', () => {
    const many = Array.from({ length: 200 }, (_, i) => `BUG-${i + 1}`).join(' ');
    expect(extractKeyActions(many)).toHaveLength(50);
    expect(extractKeyActions('x'.repeat(100_000) + ' ARI-BUG-0001')).toEqual([]);
  });
  it('lit les branches et en génère de normalisées', () => {
    expect(keysFromBranch('bugfix/ARI-BUG-0012-crash-demarrage')).toEqual(['ARI-BUG-0012']);
    expect(keysFromBranch('main')).toEqual([]);
    expect(branchName('bugfix', 'ARI-BUG-0012', 'Crash au démarrage !')).toBe('bugfix/ARI-BUG-0012-crash-au-demarrage');
  });
});

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };

suite('interaction avec GitLab (intégration)', () => {
  let testDb: TestDb;
  let artifacts: ArtifactService;
  let code: GitCodeService;
  const org = crypto.randomUUID();
  const status = async (key: string) => (await artifacts.get(org, 'ARI', key)).status;
  const commit = (message: string, email = 'dev@example.test', id = Math.random().toString(16).slice(2).padEnd(40, '0')) => ({
    object_kind: 'push' as const, ref: 'refs/heads/main', commits: [{ id, message, url: `http://git/c/${id}`, author: { email } }],
  });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_gitcode');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    code = new GitCodeService(db, artifacts);
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'git']);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-dev','dev','Dev','dev@example.test')", [org]);
    });
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    for (const n of [1, 2, 3]) await artifacts.create(org, 'ARI', 'BUG', { title: `Bug ${n}`, severity: 'majeure', assignee: 'sub-dev' }, admin);
  });
  afterAll(async () => { await testDb?.drop(); });

  it('lie un commit et démarre le travail au nom du développeur', async () => {
    const results = await code.handle(org, 'ARI', commit('Corrige le crash\n\nRefs ARI-BUG-0001'));
    expect(results).toEqual([
      { key: 'ARI-BUG-0001', outcome: 'linked' },
      { key: 'ARI-BUG-0001', outcome: 'transitioned', detail: 'Démarrer' },
    ]);
    expect(await status('ARI-BUG-0001')).toBe('in_progress');
    expect(await code.refs(org, 'ARI', 'ARI-BUG-0001')).toMatchObject([{ kind: 'commit', title: 'Corrige le crash' }]);
  });

  it('est idempotent pour un même commit', async () => {
    const same = commit('Refs ARI-BUG-0002', 'dev@example.test', 'a'.repeat(40));
    await code.handle(org, 'ARI', same);
    const again = await code.handle(org, 'ARI', same);
    expect(again.map((r) => r.outcome)).toEqual(['ignored']);
    expect((await code.refs(org, 'ARI', 'ARI-BUG-0002')).length).toBe(1);
  });

  it("ne transitionne pas sans correspondance d'utilisateur, mais crée le lien", async () => {
    const results = await code.handle(org, 'ARI', commit('Refs ARI-BUG-0003', 'inconnu@example.test'));
    expect(results).toEqual([{ key: 'ARI-BUG-0003', outcome: 'linked' }]);
    expect(await status('ARI-BUG-0003')).toBe('open');
  });

  it('signale les artefacts inconnus sans échouer', async () => {
    expect(await code.handle(org, 'ARI', commit('Fixes ARI-BUG-0404'))).toEqual([{ key: 'ARI-BUG-0404', outcome: 'unknown_artifact' }]);
  });

  it('suit une MR : ouverture → revue, pipeline, fusion avec Fixes → résolu seulement si le workflow le permet', async () => {
    const mr = (state: string, extra = {}) => ({
      object_kind: 'merge_request' as const, user: { email: 'dev@example.test' },
      object_attributes: { iid: 7, title: 'Fixes ARI-BUG-0001', description: '', state, url: 'http://git/mr/7', source_branch: 'bugfix/ARI-BUG-0001-crash', ...extra },
    });
    const opened = await code.handle(org, 'ARI', mr('opened'));
    expect(opened.find((r) => r.outcome === 'transitioned')).toMatchObject({ key: 'ARI-BUG-0001', detail: 'Soumettre à revue' });
    expect(await status('ARI-BUG-0001')).toBe('in_review');

    const piped = await code.handle(org, 'ARI', { object_kind: 'pipeline', object_attributes: { status: 'failed' }, merge_request: { iid: 7 } });
    expect(piped).toMatchObject([{ key: 'ARI-BUG-0001', detail: 'pipeline failed' }]);
    expect((await code.refs(org, 'ARI', 'ARI-BUG-0001')).find((r: { kind: string }) => r.kind === 'mr')).toMatchObject({ pipeline: 'failed', state: 'opened' });

    // Résoudre exige « root_cause » : le validateur bloque, le message de commit ne contourne rien.
    const merged = await code.handle(org, 'ARI', mr('merged'));
    const blocked = merged.find((r) => r.outcome === 'blocked');
    expect(blocked?.detail).toMatch(/Résoudre.*root_cause/);
    expect(await status('ARI-BUG-0001')).toBe('in_review');

    const art = await artifacts.get(org, 'ARI', 'ARI-BUG-0001');
    await artifacts.update(org, 'ARI', 'ARI-BUG-0001', { root_cause: 'Fuite de connexion' }, art.version, admin);
    const retry = await code.handle(org, 'ARI', mr('merged'));
    expect(retry.find((r) => r.outcome === 'transitioned')).toMatchObject({ detail: 'Résoudre' });
    expect(await status('ARI-BUG-0001')).toBe('resolved');
  });

  it("ne déclenche aucune transition quand l'artefact n'est pas dans l'état attendu (les rôles restent contrôlés par le workflow)", async () => {
    const art = await artifacts.get(org, 'ARI', 'ARI-BUG-0001');
    expect(art.status).toBe('resolved');
    const strict = new GitCodeService(new Db(testDb.pool), artifacts, { onStart: null, onMrOpened: null, onMrMergedResolves: 'Livrer' });
    const results = await strict.handle(org, 'ARI', {
      object_kind: 'merge_request', user: { email: 'dev@example.test' },
      object_attributes: { iid: 8, title: 'Closes ARI-BUG-0001', state: 'merged', source_branch: 'x' },
    });
    expect(results.find((r) => r.outcome === 'transitioned')).toBeUndefined(); // statut « resolved » : transition non applicable
    expect(await status('ARI-BUG-0001')).toBe('resolved');
  });
});
