import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { bugTemplate } from '../core/templates';
import { TrackerService } from '../core/tracker.service';
import { GitLabClient } from '../history/gitlab-client';
import { createTestDb, fromEnv, pgUp, probe, type TestDb } from '../testing/harness';
import { DocLinkService } from './doc-link.service';
import { DocWriteback } from './doc-writeback';

const GITLAB_URL = fromEnv('GITLAB_TEST_URL') ?? 'http://127.0.0.1:8929';
const TOKEN = fromEnv('GITLAB_DEV_TOKEN');
const gitlabUp = !!TOKEN && probe("fetch(process.env.U+'/users/sign_in',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))", { U: GITLAB_URL });
const suite = pgUp && gitlabUp ? describe : describe.skip;
const alice: Actor = { id: 'sub-alice', roles: ['athena-team-member', 'athena-admin'] };

const SDOC = `[DOCUMENT]
MID: abc
TITLE: Spécification

[REQUIREMENT]
UID: SYS-1
TITLE: Journal
STATEMENT: Le système shall journaliser.
`;

suite('report des références vers GitLab (intégration)', () => {
  let testDb: TestDb;
  let docs: DocLinkService;
  let writeback: DocWriteback;
  let gitlab: GitLabClient;
  let repoId: number;
  const org = crypto.randomUUID();
  const repoName = `athena-docs-test-${Date.now().toString(36)}`;

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_writeback');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    docs = new DocLinkService(db);
    gitlab = new GitLabClient(GITLAB_URL, TOKEN!);
    writeback = new DocWriteback(db, gitlab);
    await db.tx(org, async (c) => {
      await c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'wb']);
      await c.query("insert into user_account (organization_id, subject, username, display_name, email) values ($1,'sub-alice','alice','Alice Martin','alice@example.test')", [org]);
    });
    await trackers.createProject(org, 'ARI', 'Ariane', alice);
    await trackers.createTracker(org, bugTemplate('ARI'), alice);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Crash', severity: 'majeure' }, alice);
    repoId = await gitlab.ensureRepository('root', repoName);
    await gitlab.commit(repoId, { branch: 'main', message: 'docs: initial', authorName: 'Doc', authorEmail: 'doc@example.test', actions: [{ action: 'create', file_path: 'spec.sdoc', content: SDOC }] });
    await docs.index(org, 'ARI', 'spec', [{ path: 'spec.sdoc', content: SDOC }], null, alice);
    await docs.link(org, 'ARI', 'ARI-BUG-0001', 'spec', 'SYS-1', alice);
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  it('propose une merge request, auteur réel, sans toucher à la branche principale, puis ne propose plus rien une fois fusionnée', async () => {
    const result = await writeback.proposeRefs(org, 'ARI', 'spec', `root/${repoName}`, 'main', alice);
    expect(result).toMatchObject({ files: 1, updatedNodes: 1 });
    expect(result.mergeRequest).not.toBeNull();
    expect(await gitlab.fileContent(repoId, 'spec.sdoc', 'main')).not.toContain('ATHENA_REFS');
    const mr = await gitlab.openMergeRequest(repoId, (await mrBranch())!, 'main');
    expect(mr!.iid).toBe(result.mergeRequest!.iid);
    const commits = await gitlab.commits(repoId, 'spec.sdoc', (await mrBranch())!);
    expect(commits[0]!.author_name).toBe('Alice Martin');
    await gitlab.mergeMergeRequest(repoId, mr!.iid);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(await gitlab.fileContent(repoId, 'spec.sdoc', 'main')).toContain('ATHENA_REFS: ARI-BUG-0001');
    expect(await writeback.proposeRefs(org, 'ARI', 'spec', `root/${repoName}`, 'main', alice)).toEqual({ files: 0, updatedNodes: 0, mergeRequest: null });
  }, 60_000);

  async function mrBranch(): Promise<string | null> {
    const list = await (await fetch(`${GITLAB_URL}/api/v4/projects/${repoId}/merge_requests?state=opened`, { headers: { 'PRIVATE-TOKEN': TOKEN! } })).json() as Array<{ source_branch: string }>;
    return list[0]?.source_branch ?? null;
  }
});
