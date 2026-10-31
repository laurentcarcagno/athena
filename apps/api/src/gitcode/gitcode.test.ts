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
    expect(extractKeyActions('Fixes BUG-1, BUG-2 et REQ-3\n\nVoir aussi INC-9')).toEqual([
      { key: 'BUG-1', action: 'fixes' }, { key: 'BUG-2', action: 'fixes' }, { key: 'REQ-3', action: 'fixes' }, { key: 'INC-9', action: 'refs' },
    ]);
    expect(extractKeyActions('closes: BUG-7')).toEqual([{ key: 'BUG-7', action: 'closes' }]);
    expect(extractKeyActions('Implements REQ-4')).toEqual([{ key: 'REQ-4', action: 'implements' }]);
    expect(extractKeyActions('Reverts BUG-5')).toEqual([{ key: 'BUG-5', action: 'reverts' }]);
    expect(extractKeyActions('refs BUG-1')).toEqual([{ key: 'BUG-1', action: 'refs' }]);
  });
  it('ignore ce qui ne ressemble pas à une clé', () => {
    expect(extractKeyActions('utf-8 et sha-256, bug-12, X-1, ABC-')).toEqual([]);
  });
  it('borne le nombre de clés et la taille du texte', () => {
    const many = Array.from({ length: 200 }, (_, i) => `BUG-${i + 1}`).join(' ');
    expect(extractKeyActions(many)).toHaveLength(50);
    expect(extractKeyActions('x'.repeat(100_000) + ' BUG-1')).toEqual([]);
  });
  it('lit les branches et en génère de normalisées', () => {
    expect(keysFromBranch('bugfix/BUG-12-crash-demarrage')).toEqual(['BUG-12']);
    expect(keysFromBranch('main')).toEqual([]);
    expect(branchName('bugfix', 'BUG-12', 'Crash au démarrage !')).toBe('bugfix/BUG-12-crash-au-demarrage');
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
    const results = await code.handle(org, 'ARI', commit('Corrige le crash\n\nRefs BUG-1'));
    expect(results).toEqual([
      { key: 'BUG-1', outcome: 'linked' },
      { key: 'BUG-1', outcome: 'transitioned', detail: 'Démarrer' },
    ]);
    expect(await status('BUG-1')).toBe('in_progress');
    expect(await code.refs(org, 'ARI', 'BUG-1')).toMatchObject([{ kind: 'commit', title: 'Corrige le crash' }]);
  });

  it('est idempotent pour un même commit', async () => {
    const same = commit('Refs BUG-2', 'dev@example.test', 'a'.repeat(40));
    await code.handle(org, 'ARI', same);
    const again = await code.handle(org, 'ARI', same);
    expect(again.map((r) => r.outcome)).toEqual(['ignored']);
    expect((await code.refs(org, 'ARI', 'BUG-2')).length).toBe(1);
  });

  it("ne transitionne pas sans correspondance d'utilisateur, mais crée le lien", async () => {
    const results = await code.handle(org, 'ARI', commit('Refs BUG-3', 'inconnu@example.test'));
    expect(results).toEqual([{ key: 'BUG-3', outcome: 'linked' }]);
    expect(await status('BUG-3')).toBe('open');
  });

  it('signale les artefacts inconnus sans échouer', async () => {
    expect(await code.handle(org, 'ARI', commit('Fixes BUG-404'))).toEqual([{ key: 'BUG-404', outcome: 'unknown_artifact' }]);
  });

  it('suit une MR : ouverture → revue, pipeline, fusion avec Fixes → résolu seulement si le workflow le permet', async () => {
    const mr = (state: string, extra = {}) => ({
      object_kind: 'merge_request' as const, user: { email: 'dev@example.test' },
      object_attributes: { iid: 7, title: 'Fixes BUG-1', description: '', state, url: 'http://git/mr/7', source_branch: 'bugfix/BUG-1-crash', ...extra },
    });
    const opened = await code.handle(org, 'ARI', mr('opened'));
    expect(opened.find((r) => r.outcome === 'transitioned')).toMatchObject({ key: 'BUG-1', detail: 'Soumettre à revue' });
    expect(await status('BUG-1')).toBe('in_review');

    const piped = await code.handle(org, 'ARI', { object_kind: 'pipeline', object_attributes: { status: 'failed' }, merge_request: { iid: 7 } });
    expect(piped).toMatchObject([{ key: 'BUG-1', detail: 'pipeline failed' }]);
    expect((await code.refs(org, 'ARI', 'BUG-1')).find((r: { kind: string }) => r.kind === 'mr')).toMatchObject({ pipeline: 'failed', state: 'opened' });

    // Résoudre exige « root_cause » : le validateur bloque, le message de commit ne contourne rien.
    const merged = await code.handle(org, 'ARI', mr('merged'));
    const blocked = merged.find((r) => r.outcome === 'blocked');
    expect(blocked?.detail).toMatch(/Résoudre.*root_cause/);
    expect(await status('BUG-1')).toBe('in_review');

    const art = await artifacts.get(org, 'ARI', 'BUG-1');
    await artifacts.update(org, 'ARI', 'BUG-1', { root_cause: 'Fuite de connexion' }, art.version, admin);
    const retry = await code.handle(org, 'ARI', mr('merged'));
    expect(retry.find((r) => r.outcome === 'transitioned')).toMatchObject({ detail: 'Résoudre' });
    expect(await status('BUG-1')).toBe('resolved');
  });

  it("ne déclenche aucune transition quand l'artefact n'est pas dans l'état attendu (les rôles restent contrôlés par le workflow)", async () => {
    const art = await artifacts.get(org, 'ARI', 'BUG-1');
    expect(art.status).toBe('resolved');
    const strict = new GitCodeService(new Db(testDb.pool), artifacts, { onStart: null, onMrOpened: null, onMrMergedResolves: 'Livrer' });
    const results = await strict.handle(org, 'ARI', {
      object_kind: 'merge_request', user: { email: 'dev@example.test' },
      object_attributes: { iid: 8, title: 'Closes BUG-1', state: 'merged', source_branch: 'x' },
    });
    expect(results.find((r) => r.outcome === 'transitioned')).toBeUndefined(); // statut « resolved » : transition non applicable
    expect(await status('BUG-1')).toBe('resolved');
  });
});
