import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Db, type Actor } from '../core/db';
import { DomainError } from '../core/errors';
import { ExportMarker } from '../core/export-marking';
import { FieldTypeRegistry } from '../core/field-types';
import { runAs } from '../core/request-context';
import { AccessService } from '../core/access.service';
import { TrackerService } from '../core/tracker.service';
import { DocLinkService } from '../docs/doc-link.service';
import { createTestDb, pgUp, type TestDb } from '../testing/harness';
import { BaselineService } from './baseline.service';
import type { GitLabClient } from './gitlab-client';

const suite = pgUp ? describe : describe.skip;
const admin: Actor = { id: 'u-admin', roles: ['athena-user', 'athena-admin'] };

const urd = (variant: 'v1' | 'v2') => `[DOCUMENT]
TITLE: Exigences utilisateur

[[SECTION]]
UID: URD-SEC
TITLE: Connexion

[REQUIREMENT]
UID: URD-1
TITLE: Authentification
STATEMENT: ${variant === 'v1' ? "L'utilisateur se connecte." : "L'utilisateur se connecte avec un second facteur."}

[REQUIREMENT]
UID: URD-2
TITLE: Journalisation
STATEMENT: Chaque connexion est journalisée.
${variant === 'v1' ? `
[REQUIREMENT]
UID: URD-10
TITLE: Supervision
STATEMENT: Métriques de supervision.
` : `
[REQUIREMENT]
UID: URD-3
TITLE: Verrouillage
STATEMENT: Le compte se verrouille après cinq échecs.
`}
[[/SECTION]]
`;

/** GitLab simulé : un dépôt de documentation dont on fait avancer la tête, un dépôt d'historique, des étiquettes. */
class FakeGitLab {
  readonly heads = new Map<string, string>([['docs/urd', 'aaaa1111aaaa1111']]);
  readonly tags: string[] = [];
  async findRepository(path: string) { return this.heads.has(path) ? [...this.heads.keys()].indexOf(path) + 10 : null; }
  async branchHead(repo: number) { return repo === 1 ? 'history0000history' : [...this.heads.values()][repo - 10]!; }
  async ensureRepository() { return 1; }
  async createTag(_repo: number, tag: string) { this.tags.push(tag); }
  async compare() { return { diffs: [] as Array<{ new_path: string; new_file: boolean; deleted_file: boolean }> }; }
}

suite('baselines couplées aux versions des documents (intégration)', () => {
  let testDb: TestDb;
  let db: Db;
  let docs: DocLinkService;
  let baselines: BaselineService;
  const gitlab = new FakeGitLab();
  const org = crypto.randomUUID();
  const origin = { repoPath: 'docs/urd', ref: 'main' };

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_baseline_docs');
    db = new Db(testDb.pool);
    docs = new DocLinkService(db);
    baselines = new BaselineService(testDb.pool, gitlab as unknown as GitLabClient, 'ns');
    await db.tx(org, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [org, 'bd']));
    for (const s of ['u-admin', 'u-bob']) await db.tx(org, (c) => c.query('insert into user_account (organization_id, subject, username, display_name) values ($1,$2,$2,$2)', [org, s]));
    await new TrackerService(db, new FieldTypeRegistry()).createProject(org, 'ARI', 'Ariane', admin);
    await db.tx(org, (c) => c.query('update outbox_event set history_synced_at = now()'), { system: true }); // historique à jour
  }, 60_000);
  afterAll(async () => { await testDb?.drop(); });

  const code = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); return e instanceof DomainError ? `${e.code}:${e.details.join('|')}` : e ? `autre:${(e as Error).message}` : 'ok'; };

  it('une baseline enregistre le SHA de chaque source documentaire et l’empreinte de chacune de ses exigences', async () => {
    await docs.index(org, 'ARI', 'urd', [{ path: 'docs/urd.sdoc', content: urd('v1') }], 'aaaa1111aaaa1111', admin, origin);
    await docs.index(org, 'ARI', 'manuel', [{ path: 'm.sdoc', content: '[REQUIREMENT]\nUID: MAN-1\nTITLE: Manuel\nSTATEMENT: x\n' }], null, admin); // sans dépôt : non contrôlée
    const b1 = await baselines.create(org, 'ARI', 'B1', admin);
    expect(b1.docShas).toEqual({ manuel: null, urd: 'aaaa1111aaaa1111' });
    const nodes = await db.tx(org, async (c) => (await c.query("select source_name, uid from baseline_doc_node n join baseline b on b.id = n.baseline_id where b.name = 'B1' order by 1, 2")).rows.map((r) => `${r.source_name}:${r.uid}`), { system: true });
    expect(nodes).toEqual(['manuel:MAN-1', 'urd:URD-1', 'urd:URD-10', 'urd:URD-2', 'urd:URD-SEC']);
    expect(gitlab.tags).toEqual(['baseline/B1']);
  });

  it('bloque l’écart silencieux : un dépôt documentaire qui a avancé depuis l’indexation refuse la baseline', async () => {
    gitlab.heads.set('docs/urd', 'bbbb2222bbbb2222');
    const message = await code(baselines.create(org, 'ARI', 'B2', admin));
    expect(message).toBe('conflict:urd : indexé à aaaa1111, dépôt à bbbb2222');
    expect(await db.tx(org, async (c) => Number((await c.query("select count(*) n from baseline where name = 'B2'")).rows[0].n), { system: true })).toBe(0);
    expect(gitlab.tags).toEqual(['baseline/B1']); // aucune étiquette posée
    gitlab.heads.delete('docs/urd');
    expect(await code(baselines.create(org, 'ARI', 'B2', admin))).toMatch(/^conflict:urd : dépôt docs\/urd introuvable/);
    gitlab.heads.set('docs/urd', 'bbbb2222bbbb2222');
  });

  it('la comparaison de deux baselines liste les exigences ajoutées, modifiées, supprimées et le changement de SHA', async () => {
    await docs.index(org, 'ARI', 'urd', [{ path: 'docs/urd.sdoc', content: urd('v2') }], 'bbbb2222bbbb2222', admin, origin);
    await baselines.create(org, 'ARI', 'B2', admin);
    const diff = await baselines.docDiff(org, 'ARI', 'B1', 'B2');
    expect(diff).toEqual([{
      source: 'urd', from: 'aaaa1111aaaa1111', to: 'bbbb2222bbbb2222',
      added: [{ uid: 'URD-3', title: 'Verrouillage' }], modified: [{ uid: 'URD-1', title: 'Authentification' }], removed: [{ uid: 'URD-10', title: 'Supervision' }],
    }]); // la source « manuel » n'a pas changé : omise
    const reverse = await baselines.docDiff(org, 'ARI', 'B2', 'B1');
    expect(reverse[0]).toMatchObject({ added: [{ uid: 'URD-10', title: 'Supervision' }], removed: [{ uid: 'URD-3', title: 'Verrouillage' }], from: 'bbbb2222bbbb2222' });
    expect(await code(baselines.docDiff(org, 'ARI', 'B1', 'inconnue'))).toMatch(/^not_found/);
    expect((await baselines.diff(org, 'ARI', 'B1', 'B2')).docs).toEqual(diff);
  });

  it('exportable en CSV, cellules protégées contre les formules, avec la mention de protection de l’instance', async () => {
    await docs.index(org, 'ARI', 'urd', [{ path: 'docs/urd.sdoc', content: urd('v2').replace('Verrouillage', '=HYPERLINK("x")') }], 'bbbb2222bbbb2222', admin, origin);
    await baselines.create(org, 'ARI', 'B3', admin);
    const { filename, csv } = await baselines.diffCsv(org, 'ARI', 'B1', 'B3');
    expect(filename).toBe('baselines-ARI-B1-B3.csv');
    expect(csv.startsWith('﻿kind,change,key,title\n')).toBe(true);
    expect(csv).toContain('document-source,sha,urd,aaaa1111aaaa1111 -> bbbb2222bbbb2222');
    expect(csv).toContain('requirement,modified,urd:URD-1,Authentification');
    expect(csv).toContain('requirement,removed,urd:URD-10,Supervision');
    expect(csv).toContain(`requirement,added,urd:URD-3,"'=HYPERLINK(""x"")"`);
    const marked = new ExportMarker('Diffusion Restreinte').csv(csv);
    expect(marked.replace(/^﻿/, '').startsWith('"Diffusion Restreinte"\n')).toBe(true);
    expect(marked.trimEnd().endsWith('"Diffusion Restreinte"')).toBe(true);
  });

  it('respecte les listes d’ayants droit du projet', async () => {
    const access = new AccessService(db);
    await access.set(org, 'ARI', { members: ['u-admin'] }, admin);
    expect(await runAs('u-bob', () => code(baselines.docDiff(org, 'ARI', 'B1', 'B2')))).toMatch(/^not_found/);
    expect((await runAs('u-admin', () => baselines.docDiff(org, 'ARI', 'B1', 'B2'))).length).toBe(1);
    await access.remove(org, 'ARI', null, admin);
  });
});
