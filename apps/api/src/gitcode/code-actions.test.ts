import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { DocFetcher } from '../docs/doc-fetch';
import { DocLinkService } from '../docs/doc-link.service';
import { GitLabClient } from '../history/gitlab-client';
import { createTestDb, fromEnv, pgUp, probe, type TestDb } from '../testing/harness';
import { CodeActions } from './code-actions';
import { GitCodeService } from './gitcode.service';

const GITLAB_URL = fromEnv('GITLAB_TEST_URL') ?? 'http://127.0.0.1:8929';
const TOKEN = fromEnv('GITLAB_DEV_TOKEN');
const gitlabUp = !!TOKEN && probe("fetch(process.env.U+'/users/sign_in',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))", { U: GITLAB_URL });
const suite = pgUp && gitlabUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-team-member', 'athena-admin'] };

async function code(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (e: unknown) => e);
  return error instanceof DomainError ? `${error.code}:${error.message} ${error.details.join(' ')}` : `autre:${(error as Error)?.message}`;
}

suite('branches, merge requests et documentation depuis GitLab (réel)', () => {
  let testDb: TestDb;
  let gitlab: GitLabClient;
  let actions: CodeActions;
  let artifacts: ArtifactService;
  let gitCode: GitCodeService;
  let docs: DocLinkService;
  const org = crypto.randomUUID();
  const suffix = Date.now().toString(36);
  const codeRepo = `root/app-code-${suffix}`;
  const docRepo = `root/app-docs-${suffix}`;
  let codeId = 0;

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_codeactions');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    artifacts = new ArtifactService(db, trackers, registry);
    gitlab = new GitLabClient(GITLAB_URL, TOKEN!);
    actions = new CodeActions(db, gitlab);
    gitCode = new GitCodeService(db, artifacts);
    docs = new DocLinkService(db);
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'code']);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-dev','dev','Dev','dev@example.test')", [org]);
    });
    await trackers.createProject(org, 'ARI', 'Ariane', admin);
    await trackers.createTracker(org, bugTemplate('ARI'), admin);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Crash au démarrage', severity: 'majeure', assignee: 'sub-dev' }, admin);
    codeId = await gitlab.ensureRepository('root', `app-code-${suffix}`);
    const docId = await gitlab.ensureRepository('root', `app-docs-${suffix}`);
    await gitlab.commit(docId, {
      branch: 'main', message: 'Ajoute la spécification', authorName: 'Doc', authorEmail: 'doc@example.test',
      actions: [
        { action: 'create', file_path: 'spec/main.sdoc', content: '[DOCUMENT]\nTITLE: Spec\n\n[REQUIREMENT]\nUID: SYS-1\nTITLE: Journal\nSTATEMENT: Le système journalise.\nATHENA_REFS: ARI-BUG-0001\n' },
        { action: 'create', file_path: 'autre/ignore.md', content: '# non indexé' },
      ],
    });
  }, 90_000);
  afterAll(async () => { await testDb?.drop(); });

  it('associe un dépôt de code et refuse un dépôt inconnu', async () => {
    expect(await code(actions.addRepo(org, 'ARI', 'root/inexistant-xyz', 'main', admin))).toMatch(/validation.*introuvable/);
    expect(await actions.addRepo(org, 'ARI', codeRepo, 'main', admin)).toEqual({ path: codeRepo, defaultBranch: 'main' });
    expect(await actions.repos(org, 'ARI')).toEqual([{ path: codeRepo, defaultBranch: 'main' }]);
  }, 60_000);

  it('crée la branche normalisée depuis le ticket et la lie à l’artefact', async () => {
    const result = await actions.createBranch(org, 'ARI', 'ARI-BUG-0001', 'bugfix', undefined, admin);
    expect(result.branch).toBe('bugfix/ARI-BUG-0001-crash-au-demarrage');
    expect(await gitlab.branchHead(codeId, result.branch)).toMatch(/^[0-9a-f]{40}$/);
    expect(await gitCode.refs(org, 'ARI', 'ARI-BUG-0001')).toMatchObject([{ kind: 'branch', ref: 'bugfix/ARI-BUG-0001-crash-au-demarrage' }]);
    expect(await code(actions.createBranch(org, 'ARI', 'ARI-BUG-0001', 'bugfix', undefined, admin))).toMatch(/conflict.*existe déjà/);
    expect(await code(actions.createBranch(org, 'ARI', 'ARI-BUG-0404', 'bugfix', undefined, admin))).toMatch(/not_found/);
  }, 60_000);

  it('ouvre une merge request en brouillon qui référence le ticket', async () => {
    await gitlab.commit(codeId, { branch: 'bugfix/ARI-BUG-0001-crash-au-demarrage', message: 'Corrige le crash\n\nRefs ARI-BUG-0001', authorName: 'Dev', authorEmail: 'dev@example.test', actions: [{ action: 'create', file_path: 'fix.txt', content: 'correctif\n' }] });
    const mr = await actions.createMergeRequest(org, 'ARI', 'ARI-BUG-0001', 'bugfix/ARI-BUG-0001-crash-au-demarrage', undefined, admin);
    expect(mr.url).toContain(codeRepo);
    const refs = await gitCode.refs(org, 'ARI', 'ARI-BUG-0001');
    expect(refs.find((r: { kind: string }) => r.kind === 'mr')).toMatchObject({ ref: String(mr.iid), title: 'ARI-BUG-0001: Crash au démarrage', state: 'opened' });
    // La MR ouverte déclenche ensuite la transition « Soumettre à revue » par le webhook GitLab habituel.
    const hook = await gitCode.handle(org, 'ARI', {
      object_kind: 'merge_request', user: { email: 'dev@example.test' },
      object_attributes: { iid: mr.iid, title: 'Draft: ARI-BUG-0001: Crash au démarrage', description: 'Refs ARI-BUG-0001', state: 'opened', source_branch: 'bugfix/ARI-BUG-0001-crash-au-demarrage' },
    });
    expect(hook.some((r) => r.outcome === 'transitioned')).toBe(false); // le bug est « open » : il faut d'abord démarrer
  }, 60_000);

  it('refuse une branche qui n’est pas celle de l’artefact', async () => {
    expect(await code(actions.createMergeRequest(org, 'ARI', 'ARI-BUG-0001', 'main', undefined, admin))).toMatch(/validation/);
    expect(await code(actions.createMergeRequest(org, 'ARI', 'ARI-BUG-0001', 'feature/ARI-BUG-0002-autre', undefined, admin))).toMatch(/validation/);
    expect(await code(actions.createMergeRequest(org, 'ARI', 'ARI-BUG-0001', 'x" ; drop', undefined, admin))).toMatch(/validation/);
  });

  it('récupère et indexe les .sdoc d’un dépôt GitLab, et crée les liens déclarés', async () => {
    const fetcher = new DocFetcher(gitlab, docs);
    const result = await fetcher.sync(org, 'ARI', 'spec', docRepo, 'main', 'spec', admin);
    expect(result).toMatchObject({ files: 1, nodes: 1, linksCreated: 1 });
    expect(result.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(await docs.links(org, 'ARI', 'ARI-BUG-0001')).toMatchObject([{ uid: 'SYS-1', origin: 'document' }]);
    expect(await code(fetcher.sync(org, 'ARI', 'spec', 'root/inexistant-xyz', 'main', undefined, admin))).toMatch(/validation/);
    expect(await code(fetcher.sync(org, 'ARI', 'spec', docRepo, 'main', '../etc', admin))).toMatch(/validation/);
  }, 60_000);
});
