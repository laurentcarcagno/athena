import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, fromEnv, pgUp, probe, type TestDb } from '../testing/harness';
import { S3Client } from '../storage/s3';
import { ArtifactService } from './artifact.service';
import { AttachmentService, MAX_ATTACHMENT_BYTES, sanitizeName } from './attachment.service';
import { Db, type Actor } from './db';
import { DomainError } from './errors';
import { FieldTypeRegistry } from './field-types';
import { TrackerService } from './tracker.service';

const user = fromEnv('MINIO_ROOT_USER');
const secret = fromEnv('MINIO_ROOT_PASSWORD');
const minioUp = !!user && !!secret && probe("fetch('http://127.0.0.1:9000/minio/health/live').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))", {});
const suite = pgUp && minioUp ? describe : describe.skip;
const actor: Actor = { id: 'u1', roles: ['athena-user', 'athena-admin'] };

describe('nom de fichier', () => {
  it('neutralise chemins et caractères dangereux', () => {
    expect(sanitizeName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeName('C:\\temp\\rapport.pdf')).toBe('rapport.pdf');
    expect(sanitizeName('..hidden<x>.txt')).toBe('hidden_x_.txt');
    expect(() => sanitizeName('   ')).toThrow(DomainError);
  });
});

suite('pièces jointes (PostgreSQL + MinIO)', () => {
  let testDb: TestDb;
  let service: AttachmentService;
  const org = crypto.randomUUID();
  const other = crypto.randomUUID();
  const s3 = new S3Client({ endpoint: 'http://127.0.0.1:9000', region: 'us-east-1', accessKey: user!, secretKey: secret!, bucket: `athena-test-${Date.now()}` });

  beforeAll(async () => {
    testDb = await createTestDb('athena_test_attach');
    const db = new Db(testDb.pool);
    const registry = new FieldTypeRegistry();
    const trackers = new TrackerService(db, registry);
    const artifacts = new ArtifactService(db, trackers, registry);
    service = new AttachmentService(db, s3);
    for (const id of [org, other]) await db.tx(id, (c) => c.query('insert into organization (id, key, name) values ($1,$2,$2)', [id, `o${id.slice(0, 6)}`]));
    await trackers.createProject(org, 'ARI', 'Ariane', actor);
    await trackers.createTracker(org, {
      projectKey: 'ARI', key: 'BUG', name: 'Bugs',
      fields: [{ key: 'title', label: 'Titre', type: 'text', required: true, semanticRole: 'title' }],
      statuses: [{ key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [],
    }, actor);
    await artifacts.create(org, 'ARI', 'BUG', { title: 'Crash' }, actor);
    await s3.ensureBucket();
  }, 30_000);
  afterAll(async () => { await testDb?.drop(); });

  it('stocke, liste, relit à l’identique et supprime', async () => {
    const data = Buffer.from('contenu binaire \u0000\u0001 de test');
    const meta = await service.add(org, 'ARI', 'BUG-1', '../capture.png', 'IMAGE/PNG', data, actor);
    expect(meta).toMatchObject({ name: 'capture.png', contentType: 'image/png', size: data.length });
    expect((await service.list(org, 'ARI', 'BUG-1')).map((a) => a.id)).toEqual([meta.id]);
    const read = await service.read(org, 'ARI', 'BUG-1', meta.id);
    expect(read.data.equals(data)).toBe(true);
    await service.remove(org, 'ARI', 'BUG-1', meta.id, actor);
    expect(await service.list(org, 'ARI', 'BUG-1')).toEqual([]);
    await expect(service.read(org, 'ARI', 'BUG-1', meta.id)).rejects.toBeInstanceOf(DomainError);
  });

  it('refuse vide, trop gros, type invalide ramené à octet-stream, et artefact inconnu', async () => {
    await expect(service.add(org, 'ARI', 'BUG-1', 'a.txt', 'text/plain', Buffer.alloc(0), actor)).rejects.toBeInstanceOf(DomainError);
    await expect(service.add(org, 'ARI', 'BUG-1', 'a.bin', 'x/y', Buffer.alloc(MAX_ATTACHMENT_BYTES + 1), actor)).rejects.toBeInstanceOf(DomainError);
    await expect(service.add(org, 'ARI', 'BUG-9', 'a.txt', 'text/plain', Buffer.from('x'), actor)).rejects.toBeInstanceOf(DomainError);
    const meta = await service.add(org, 'ARI', 'BUG-1', 'n.txt', '<script>', Buffer.from('x'), actor);
    expect(meta.contentType).toBe('application/octet-stream');
  });

  it('isole les organisations et journalise', async () => {
    const meta = (await service.list(org, 'ARI', 'BUG-1'))[0]!;
    await expect(service.read(other, 'ARI', 'BUG-1', meta.id)).rejects.toBeInstanceOf(DomainError);
    const audits = await testDb.pool.connect().then(async (c) => {
      try { await c.query('begin'); await c.query("select set_config('app.org_id', $1, true)", [org]); return (await c.query("select count(*) n from audit_log where action = 'attachment.add'")).rows[0].n; } finally { await c.query('rollback'); c.release(); }
    });
    expect(Number(audits)).toBeGreaterThanOrEqual(1);
  });

  it('détecte une altération du contenu stocké', async () => {
    const meta = await service.add(org, 'ARI', 'BUG-1', 'doc.txt', 'text/plain', Buffer.from('original'), actor);
    const row = await testDb.pool.connect().then(async (c) => {
      try { await c.query('begin'); await c.query("select set_config('app.org_id', $1, true)", [org]); return (await c.query('select storage_key from attachment where id = $1', [meta.id])).rows[0]; } finally { await c.query('rollback'); c.release(); }
    });
    await s3.put(row.storage_key as string, Buffer.from('falsifié'));
    await expect(service.read(org, 'ARI', 'BUG-1', meta.id)).rejects.toThrow(/Intégrité/);
  });

  it('applique les quotas par artefact et par organisation', async () => {
    const db = new Db(testDb.pool);
    const small = new AttachmentService(db, s3, { maxPerArtifact: 1, maxBytesPerOrganization: 1024 ** 3 });
    const existing = (await service.list(org, 'ARI', 'BUG-1')).length;
    expect(existing).toBeGreaterThanOrEqual(1);
    await expect(small.add(org, 'ARI', 'BUG-1', 'q.txt', 'text/plain', Buffer.from('x'), actor)).rejects.toThrow(/Données invalides|quota/i);
    const tiny = new AttachmentService(db, s3, { maxPerArtifact: 100, maxBytesPerOrganization: 5 });
    await expect(tiny.add(org, 'ARI', 'BUG-1', 'q.txt', 'text/plain', Buffer.from('x'), actor)).rejects.toBeInstanceOf(DomainError);
  });
});
