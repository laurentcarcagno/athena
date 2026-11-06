import { ITEM_KEY } from '../core/key';
import { randomBytes } from 'node:crypto';
import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { forbidden, notFound, validation } from '../core/errors';
import { LinkService } from '../core/link.service';
import { audit } from '../core/tracker.service';
import { verify } from '../webhooks/signing';
import type { SecretStore } from '../webhooks/webhook.service';
import { MappingSchema, pointer, render, resolveValues, type Mapping } from './mapper';

export const inboundSecretPath = (organizationId: string, project: string, name: string) => `athena/${organizationId}/inbound/${project}/${name}`;

export interface InboundResult {
  duplicate: boolean;
  action: string;
  key?: string;
}

/**
 * Webhooks entrants génériques : une source par projet, un secret HMAC (stocké dans le coffre), un mappage
 * déclaratif. Les commandes s'exécutent sous l'identité `inbound:<source>` avec le rôle minimal : validateurs
 * et conditions du workflow s'appliquent. Idempotence par clé (en-tête ou chemin de la charge utile).
 */
export class InboundService {
  constructor(
    private readonly db: Db,
    private readonly artifacts: ArtifactService,
    private readonly links: LinkService,
    private readonly secrets: SecretStore,
  ) {}

  async createSource(organizationId: string, projectKey: string, name: string, mapping: unknown, actor: Actor): Promise<{ secret: string; path: string }> {
    const parsed = MappingSchema.safeParse(mapping);
    if (!parsed.success) throw validation(parsed.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`));
    this.checkPaths(parsed.data);
    const secret = `inb_${randomBytes(32).toString('hex')}`;
    const orgKey = await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      await c.query('insert into inbound_source (organization_id, project_id, name, mapping, created_by) values ($1,$2,$3,$4,$5)', [organizationId, project.id, name, JSON.stringify(parsed.data), actor.id]);
      await audit(c, organizationId, actor, 'inbound.create', `inbound:${projectKey}/${name}`);
      return (await c.query('select key from organization')).rows[0].key as string;
    });
    await this.secrets.put(inboundSecretPath(organizationId, projectKey, name), { secret });
    return { secret, path: `/hooks/in/source/${orgKey}/${projectKey}/${name}` };
  }

  async handle(
    organizationId: string, projectKey: string, name: string, rawBody: string, signature: string | undefined, idempotencyHeader: string | undefined,
  ): Promise<InboundResult> {
    const secret = (await this.secrets.get(inboundSecretPath(organizationId, projectKey, name)))?.['secret'];
    if (!secret || !signature || !verify(secret, signature, rawBody)) throw forbidden('Authentification du webhook refusée.');
    let payload: unknown;
    try { payload = JSON.parse(rawBody); } catch { throw validation(['corps JSON invalide']); }

    const source = await this.db.tx(organizationId, async (c) =>
      (await c.query('select s.id, s.mapping, s.active from inbound_source s join project p on p.id = s.project_id where p.key = $1 and s.name = $2', [projectKey, name])).rows[0],
    );
    if (!source || !source.active) throw forbidden('Authentification du webhook refusée.');
    const mapping = MappingSchema.parse(source.mapping);
    const idempotency = idempotencyHeader ?? (mapping.idempotencyKey ? String(pointer(payload, mapping.idempotencyKey) ?? '') : '');
    if (idempotency) {
      const fresh = await this.db.tx(organizationId, async (c) =>
        (await c.query('insert into inbound_event (organization_id, source_id, idempotency_key) values ($1,$2,$3) on conflict do nothing', [organizationId, source.id, idempotency.slice(0, 200)])).rowCount,
      );
      if (!fresh) return { duplicate: true, action: mapping.action };
    }
    const actor: Actor = { id: `inbound:${name}`, roles: ['athena-user'] };
    return { duplicate: false, ...(await this.execute(organizationId, projectKey, mapping, payload, actor)) };
  }

  private async execute(org: string, project: string, mapping: Mapping, payload: unknown, actor: Actor): Promise<{ action: string; key?: string }> {
    switch (mapping.action) {
      case 'create': {
        const created = await this.artifacts.create(org, project, mapping.tracker, resolveValues(mapping.values, payload), actor);
        return { action: 'create', key: created.key };
      }
      case 'comment': {
        const key = this.key(mapping.key, payload);
        await this.links.addComment(org, project, key, render(mapping.body, payload), actor);
        return { action: 'comment', key };
      }
      case 'transition': {
        const key = this.key(mapping.key, payload);
        const current = await this.artifacts.get(org, project, key);
        await this.artifacts.transition(org, project, key, mapping.name, current.version, actor);
        return { action: 'transition', key };
      }
      case 'update': {
        const key = this.key(mapping.key, payload);
        const current = await this.artifacts.get(org, project, key);
        await this.artifacts.update(org, project, key, resolveValues(mapping.values, payload), current.version, actor);
        return { action: 'update', key };
      }
    }
  }

  private key(spec: string, payload: unknown): string {
    const key = spec.startsWith('$') ? String(pointer(payload, spec) ?? '') : spec;
    if (!ITEM_KEY.test(key)) throw validation(['clé d’artefact absente ou invalide dans la charge utile']);
    return key;
  }

  /** Valide les chemins à la création (une erreur de mappage se détecte avant le premier appel). */
  private checkPaths(mapping: Mapping): void {
    const specs: unknown[] = [];
    if ('values' in mapping) specs.push(...Object.values(mapping.values));
    if ('key' in mapping && mapping.key.startsWith('$')) specs.push(mapping.key);
    if (mapping.idempotencyKey) specs.push(mapping.idempotencyKey);
    for (const spec of specs) {
      const path = typeof spec === 'string' ? spec : typeof spec === 'object' && spec !== null ? (spec as { from: string }).from : null;
      if (path && path.startsWith('$') && !path.includes('{{')) {
        try { pointer({}, path); } catch (e) { throw validation([(e as Error).message]); }
      }
    }
  }
}
