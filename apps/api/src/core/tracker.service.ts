import type { PoolClient } from 'pg';
import { Db, type Actor } from './db';
import { DomainError, notFound, validation } from './errors';
import { FieldTypeRegistry } from './field-types';

export interface FieldSpec {
  key: string;
  label: string;
  type: string;
  config?: Record<string, unknown>;
  required?: boolean;
  semanticRole?: 'title' | 'description' | 'status' | 'assignee' | 'due_date' | 'estimate';
}
export interface StatusSpec {
  key: string;
  name: string;
  category: 'todo' | 'in_progress' | 'done';
}
export interface TransitionSpec {
  name: string;
  from: string | null;
  to: string;
  conditions?: unknown[];
  validators?: unknown[];
  postActions?: unknown[];
}
export interface TrackerSpec {
  projectKey: string;
  key: string;
  name: string;
  description?: string;
  fields: FieldSpec[];
  statuses: StatusSpec[];
  transitions: TransitionSpec[];
}

export interface TrackerDefinition {
  id: string;
  projectId: string;
  key: string;
  name: string;
  schemaVersion: number;
  fields: Array<Required<Pick<FieldSpec, 'key' | 'label' | 'type'>> & {
    id: string;
    config: Record<string, unknown>;
    required: boolean;
    semanticRole: string | null;
  }>;
  statuses: Array<StatusSpec & { id: string; position: number }>;
  transitions: Array<{
    id: string;
    name: string;
    fromStatusId: string | null;
    toStatusId: string;
    conditions: unknown[];
    validators: unknown[];
    postActions: unknown[];
  }>;
}

export class TrackerService {
  constructor(
    private readonly db: Db,
    private readonly fieldTypes: FieldTypeRegistry,
  ) {}

  async createProject(organizationId: string, key: string, name: string, actor: Actor): Promise<string> {
    return this.db.tx(organizationId, async (c) => {
      const id = (
        await c.query('insert into project (organization_id, key, name) values ($1,$2,$3) returning id', [
          organizationId,
          key,
          name,
        ])
      ).rows[0].id as string;
      await audit(c, organizationId, actor, 'project.create', `project:${key}`);
      return id;
    });
  }

  /** Crée un tracker complet (champs, statuts, workflow) en une transaction. */
  async createTracker(organizationId: string, spec: TrackerSpec, actor: Actor): Promise<string> {
    this.validateSpec(spec);
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [spec.projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${spec.projectKey}`);
      const tracker = (
        await c.query(
          `insert into tracker (organization_id, project_id, key, name, description)
           values ($1,$2,$3,$4,$5) returning id`,
          [organizationId, project.id, spec.key, spec.name, spec.description ?? ''],
        )
      ).rows[0].id as string;

      let position = 0;
      for (const f of spec.fields) {
        await c.query(
          `insert into field_definition (organization_id, tracker_id, key, label, type, config, required, position, semantic_role)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [organizationId, tracker, f.key, f.label, f.type, f.config ?? {}, f.required ?? false, position++, f.semanticRole ?? null],
        );
      }
      const statusIds = new Map<string, string>();
      position = 0;
      for (const s of spec.statuses) {
        const row = await c.query(
          `insert into status (organization_id, tracker_id, key, name, category, position)
           values ($1,$2,$3,$4,$5,$6) returning id`,
          [organizationId, tracker, s.key, s.name, s.category, position++],
        );
        statusIds.set(s.key, row.rows[0].id);
      }
      for (const t of spec.transitions) {
        await c.query(
          `insert into transition (organization_id, tracker_id, name, from_status_id, to_status_id, conditions, validators, post_actions)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            organizationId,
            tracker,
            t.name,
            t.from === null ? null : statusIds.get(t.from),
            statusIds.get(t.to),
            JSON.stringify(t.conditions ?? []),
            JSON.stringify(t.validators ?? []),
            JSON.stringify(t.postActions ?? []),
          ],
        );
      }
      await outbox(c, organizationId, 'tracker', tracker, 'tracker.created', { key: spec.key, project: spec.projectKey });
      await audit(c, organizationId, actor, 'tracker.create', `tracker:${spec.projectKey}/${spec.key}`);
      return tracker;
    });
  }

  async getDefinition(c: PoolClient, projectKey: string, trackerKey: string): Promise<TrackerDefinition> {
    const t = (
      await c.query(
        `select t.id, t.project_id, t.key, t.name, t.schema_version from tracker t
         join project p on p.id = t.project_id where p.key = $1 and t.key = $2`,
        [projectKey, trackerKey],
      )
    ).rows[0];
    if (!t) throw notFound(`Tracker ${projectKey}/${trackerKey}`);
    const fields = (await c.query('select * from field_definition where tracker_id = $1 order by position', [t.id])).rows;
    const statuses = (await c.query('select * from status where tracker_id = $1 order by position', [t.id])).rows;
    const transitions = (await c.query('select * from transition where tracker_id = $1', [t.id])).rows;
    return {
      id: t.id,
      projectId: t.project_id,
      key: t.key,
      name: t.name,
      schemaVersion: t.schema_version,
      fields: fields.map((f) => ({
        id: f.id, key: f.key, label: f.label, type: f.type, config: f.config, required: f.required, semanticRole: f.semantic_role,
      })),
      statuses: statuses.map((s) => ({ id: s.id, key: s.key, name: s.name, category: s.category, position: s.position })),
      transitions: transitions.map((x) => ({
        id: x.id, name: x.name, fromStatusId: x.from_status_id, toStatusId: x.to_status_id,
        conditions: x.conditions, validators: x.validators, postActions: x.post_actions,
      })),
    };
  }

  private validateSpec(spec: TrackerSpec): void {
    const errors: string[] = [];
    const dup = (items: string[], what: string) => {
      const seen = new Set<string>();
      for (const i of items) (seen.has(i) ? errors.push(`${what} en double : ${i}`) : seen.add(i));
    };
    dup(spec.fields.map((f) => f.key), 'champ');
    dup(spec.statuses.map((s) => s.key), 'statut');
    for (const f of spec.fields) if (!this.fieldTypes.has(f.type)) errors.push(`champ ${f.key} : type inconnu ${f.type}`);
    if (!spec.statuses.some((s) => s.category === 'todo')) errors.push('au moins un statut de catégorie todo est requis');
    const keys = new Set(spec.statuses.map((s) => s.key));
    for (const t of spec.transitions) {
      if (t.from !== null && !keys.has(t.from)) errors.push(`transition ${t.name} : statut source inconnu ${t.from}`);
      if (!keys.has(t.to)) errors.push(`transition ${t.name} : statut cible inconnu ${t.to}`);
    }
    if (errors.length) throw validation(errors);
  }
}

export async function outbox(
  c: PoolClient, organizationId: string, aggregateType: string, aggregateId: string, type: string, payload: unknown,
): Promise<void> {
  await c.query(
    'insert into outbox_event (organization_id, aggregate_type, aggregate_id, type, payload) values ($1,$2,$3,$4,$5)',
    [organizationId, aggregateType, aggregateId, type, JSON.stringify(payload)],
  );
}

export async function audit(
  c: PoolClient, organizationId: string, actor: Actor, action: string, target: string, detail: unknown = {},
): Promise<void> {
  await c.query(
    'insert into audit_log (organization_id, actor, action, target, detail) values ($1,$2,$3,$4,$5)',
    [organizationId, actor.id, action, target, JSON.stringify(detail)],
  );
}

export { DomainError };
