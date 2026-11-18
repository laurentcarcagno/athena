import { z } from 'zod';
import { Db, type Actor } from './db';
import type { FieldTypeRegistry } from './field-types';
import { notFound, validation } from './errors';
import { audit } from './tracker.service';

export const SharedFieldInput = z.object({
  label: z.string().trim().min(1).max(100), type: z.string().min(1).max(40), config: z.record(z.string(), z.unknown()).default({}),
});
export interface SharedField { key: string; label: string; type: string; config: Record<string, unknown>; scope: 'organization' | 'project' }

/**
 * Bibliothèque de champs partagés (plan § 15.3) : champs types (par exemple une liste de valeurs commune), définis pour l'organisation ou pour un projet. Un champ de projet
 * masque celui de l'organisation de même clé. À l'ajout d'un champ à un tracker, la définition est copiée (pas de lien vivant : un tracker existant ne change jamais seul).
 */
export class SharedFieldService {
  constructor(private readonly db: Db, private readonly fieldTypes: Pick<FieldTypeRegistry, 'has'>) {}

  async list(organizationId: string, projectKey?: string): Promise<SharedField[]> {
    const rows = await this.db.tx(organizationId, async (c) => (await c.query(
      `select s.key, s.label, s.type, s.config, (s.project_id is null) as org from shared_field s left join project p on p.id = s.project_id
        where s.project_id is null or p.key = $1 order by s.key, org desc`, [projectKey ?? null])).rows, { system: true });
    const byKey = new Map<string, SharedField>();
    for (const r of rows) byKey.set(r.key as string, { key: r.key, label: r.label, type: r.type, config: r.config, scope: r.org ? 'organization' : 'project' }); // le champ de projet vient après : il masque celui de l'organisation
    return [...byKey.values()];
  }

  async get(organizationId: string, projectKey: string, key: string): Promise<SharedField | null> {
    return (await this.list(organizationId, projectKey)).find((f) => f.key === key) ?? null;
  }

  async upsert(organizationId: string, scope: { project?: string }, key: string, input: z.infer<typeof SharedFieldInput>, actor: Actor): Promise<void> {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) throw validation(['clé de champ invalide (minuscules, chiffres, tiret bas)']);
    if (!this.fieldTypes.has(input.type)) throw validation([`type de champ inconnu : ${input.type}`]);
    await this.db.tx(organizationId, async (c) => {
      let projectId: string | null = null;
      if (scope.project) {
        projectId = (await c.query('select id from project where key = $1', [scope.project])).rows[0]?.id ?? null;
        if (!projectId) throw notFound(`Projet ${scope.project}`);
      }
      const existing = (await c.query('select id from shared_field where organization_id = $1 and key = $2 and project_id is not distinct from $3', [organizationId, key, projectId])).rows[0];
      if (existing) await c.query('update shared_field set label = $2, type = $3, config = $4, updated_at = now() where id = $1', [existing.id, input.label, input.type, JSON.stringify(input.config)]);
      else await c.query('insert into shared_field (organization_id, project_id, key, label, type, config, created_by) values ($1,$2,$3,$4,$5,$6,$7)', [organizationId, projectId, key, input.label, input.type, JSON.stringify(input.config), actor.id]);
      await audit(c, organizationId, actor, 'shared_field.upsert', `shared_field:${scope.project ?? 'org'}/${key}`, { type: input.type });
    }, { system: true });
  }

  async remove(organizationId: string, scope: { project?: string }, key: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const r = await c.query(
        'delete from shared_field s where s.key = $1 and ((s.project_id is null and $2::text is null) or s.project_id = (select id from project where key = $2)) returning id', [key, scope.project ?? null]);
      if (!r.rowCount) throw notFound(`Champ partagé ${key}`);
      await audit(c, organizationId, actor, 'shared_field.remove', `shared_field:${scope.project ?? 'org'}/${key}`, {});
    }, { system: true });
  }
}
