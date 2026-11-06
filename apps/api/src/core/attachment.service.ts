import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Db, type Actor } from './db';
import { notFound, validation } from './errors';
import { audit, outbox } from './tracker.service';
import type { Scanner } from '../storage/clamav';
import type { S3Client } from '../storage/s3';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface AttachmentView {
  id: string;
  name: string;
  contentType: string;
  size: number;
  sha256: string;
  uploadedBy: string;
  createdAt: string;
}

/** Nom de fichier sûr : pas de chemin, pas de caractères de contrôle, longueur bornée. */
export function sanitizeName(raw: string): string {
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? '';
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '_').replace(/^\.+/, '').trim().slice(0, 200);
  if (!clean) throw validation(['nom de fichier invalide']);
  return clean;
}

export interface AttachmentQuota { maxPerArtifact: number; maxBytesPerOrganization: number }
export const DEFAULT_QUOTA: AttachmentQuota = { maxPerArtifact: 50, maxBytesPerOrganization: 5 * 1024 ** 3 };

export class AttachmentService {
  constructor(private readonly db: Db, private readonly s3: S3Client, private readonly quota: AttachmentQuota = DEFAULT_QUOTA, private readonly scanner?: Scanner) {}

  async add(organizationId: string, projectKey: string, key: string, name: string, contentType: string, data: Buffer, actor: Actor): Promise<AttachmentView> {
    if (data.length === 0) throw validation(['fichier vide']);
    if (data.length > MAX_ATTACHMENT_BYTES) throw validation([`fichier trop volumineux (maximum ${MAX_ATTACHMENT_BYTES / 1024 / 1024} Mo)`]);
    const safeName = sanitizeName(name);
    const type = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(contentType) ? contentType.toLowerCase() : 'application/octet-stream';
    if (this.scanner) {
      let detection: string | null;
      try {
        detection = await this.scanner.scan(data);
      } catch {
        throw validation(['analyse antivirus indisponible : fichier refusé par précaution']); // échec fermé
      }
      if (detection) throw validation([`fichier refusé par l'antivirus : ${detection}`]);
    }
    const sha256 = createHash('sha256').update(data).digest('hex');
    const storageKey = `${organizationId}/${randomUUID()}`;
    const artifactId = await this.db.tx(organizationId, async (c) => {
      const id = await this.artifactId(c, projectKey, key);
      const used = (await c.query('select count(*) filter (where artifact_id = $1) as n, coalesce(sum(size_bytes), 0) as bytes from attachment', [id])).rows[0];
      if (Number(used.n) >= this.quota.maxPerArtifact) throw validation([`quota atteint : ${this.quota.maxPerArtifact} pièces jointes par artefact`]);
      if (Number(used.bytes) + data.length > this.quota.maxBytesPerOrganization) throw validation(['quota de stockage de l’organisation atteint']);
      return id;
    });
    await this.s3.put(storageKey, data);
    try {
      return await this.db.tx(organizationId, async (c) => {
        const row = (
          await c.query(
            `insert into attachment (organization_id, artifact_id, name, content_type, size_bytes, sha256, storage_key, uploaded_by)
             values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, created_at`,
            [organizationId, artifactId, safeName, type, data.length, sha256, storageKey, actor.id],
          )
        ).rows[0];
        await outbox(c, organizationId, 'artifact', artifactId, 'attachment.added', { key, actor: actor.id, attachmentId: row.id, name: safeName });
        await audit(c, organizationId, actor, 'attachment.add', `artifact:${key}`, { name: safeName, size: data.length, sha256 });
        return { id: row.id, name: safeName, contentType: type, size: data.length, sha256, uploadedBy: actor.id, createdAt: row.created_at.toISOString() };
      });
    } catch (error) {
      await this.s3.delete(storageKey).catch(() => undefined); // pas d'objet orphelin si la base échoue
      throw error;
    }
  }

  async list(organizationId: string, projectKey: string, key: string): Promise<AttachmentView[]> {
    return this.db.tx(organizationId, async (c) => {
      const id = await this.artifactId(c, projectKey, key);
      const rows = (await c.query('select id, name, content_type, size_bytes, sha256, uploaded_by, created_at from attachment where artifact_id = $1 order by created_at, id', [id])).rows;
      return rows.map(view);
    });
  }

  async read(organizationId: string, projectKey: string, key: string, attachmentId: string): Promise<{ meta: AttachmentView; data: Buffer }> {
    const { meta, storageKey } = await this.db.tx(organizationId, async (c) => {
      const id = await this.artifactId(c, projectKey, key);
      const row = (await c.query('select id, name, content_type, size_bytes, sha256, uploaded_by, created_at, storage_key from attachment where artifact_id = $1 and id::text = $2', [id, attachmentId])).rows[0];
      if (!row) throw notFound('Pièce jointe');
      return { meta: view(row), storageKey: row.storage_key as string };
    });
    const data = await this.s3.get(storageKey);
    if (!data) throw notFound('Contenu de la pièce jointe');
    if (createHash('sha256').update(data).digest('hex') !== meta.sha256) throw new Error('Intégrité de la pièce jointe compromise');
    return { meta, data };
  }

  async remove(organizationId: string, projectKey: string, key: string, attachmentId: string, actor: Actor): Promise<void> {
    const storageKey = await this.db.tx(organizationId, async (c) => {
      const id = await this.artifactId(c, projectKey, key);
      const row = (await c.query('delete from attachment where artifact_id = $1 and id::text = $2 returning storage_key, name', [id, attachmentId])).rows[0];
      if (!row) throw notFound('Pièce jointe');
      await outbox(c, organizationId, 'artifact', id, 'attachment.removed', { key, actor: actor.id, attachmentId });
      await audit(c, organizationId, actor, 'attachment.remove', `artifact:${key}`, { name: row.name });
      return row.storage_key as string;
    });
    await this.s3.delete(storageKey);
  }

  private async artifactId(c: PoolClient, projectKey: string, key: string): Promise<string> {
    const row = (await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [projectKey, key])).rows[0];
    if (!row) throw notFound(`Artefact ${key}`);
    return row.id as string;
  }
}

function view(r: Record<string, unknown>): AttachmentView {
  return {
    id: r['id'] as string, name: r['name'] as string, contentType: r['content_type'] as string, size: Number(r['size_bytes']),
    sha256: r['sha256'] as string, uploadedBy: r['uploaded_by'] as string, createdAt: (r['created_at'] as Date).toISOString(),
  };
}
