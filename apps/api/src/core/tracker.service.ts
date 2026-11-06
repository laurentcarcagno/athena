import { typeExists } from './tracker-types';
import { layoutProblems, type Layout } from './layout';
import type { PoolClient } from 'pg';
import { Db, type Actor } from './db';
import { DomainError, conflict, notFound, validation } from './errors';
import { FieldTypeRegistry } from './field-types';

export interface FieldSpec {
  key: string;
  label: string;
  type: string;
  config?: Record<string, unknown>;
  required?: boolean;
  semanticRole?: 'title' | 'description' | 'status' | 'assignee' | 'due_date' | 'estimate';
  /** Rôles autorisés à lire / écrire ce champ (absent = tous). `athena-admin` passe toujours. */
  readRoles?: string[];
  writeRoles?: string[];
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
  /** Type de tracker de l'organisation (livré ou propre à l'organisation) ; absent : tracker sans type. */
  typeKey?: string | null;
  /** Disposition de la vue détails (absente : automatique). */
  layout?: Layout | null;
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
  typeKey: string | null;
  historyMode: 'direct' | 'merge_request';
  layout: Layout | null;
  fields: Array<Required<Pick<FieldSpec, 'key' | 'label' | 'type'>> & {
    id: string;
    config: Record<string, unknown>;
    required: boolean;
    semanticRole: string | null;
    readRoles: string[] | null;
    writeRoles: string[] | null;
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
      if (spec.typeKey && !(await typeExists(c, spec.typeKey))) throw validation([`type de tracker inconnu : ${spec.typeKey}`]);
      const tracker = (
        await c.query(
          `insert into tracker (organization_id, project_id, key, name, description, layout, type_key)
           values ($1,$2,$3,$4,$5,$6,$7) returning id`,
          [organizationId, project.id, spec.key, spec.name, spec.description ?? '', spec.layout ? JSON.stringify(spec.layout) : null, spec.typeKey ?? null],
        )
      ).rows[0].id as string;

      let position = 0;
      for (const f of spec.fields) {
        await c.query(
          `insert into field_definition (organization_id, tracker_id, key, label, type, config, required, position, semantic_role, read_roles, write_roles)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [organizationId, tracker, f.key, f.label, f.type, f.config ?? {}, f.required ?? false, position++, f.semanticRole ?? null, f.readRoles ?? null, f.writeRoles ?? null],
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
      await outbox(c, organizationId, 'tracker', tracker, 'tracker.created', { key: spec.key, project: spec.projectKey, actor: actor.id });
      await audit(c, organizationId, actor, 'tracker.create', `tracker:${spec.projectKey}/${spec.key}`);
      return tracker;
    });
  }

  /**
   * Évolutions de configuration d'un tracker (plan § 15.3). Chaque évolution incrémente `schema_version`, est
   * auditée et produit un événement `tracker.updated` (donc un commit de `tracker.yaml` dans l'historique).
   * Les évolutions destructrices (suppression, changement de type) ne sont pas proposées : elles exigent une
   * migration de données prévisualisée.
   */
  async addField(organizationId: string, projectKey: string, trackerKey: string, field: FieldSpec, actor: Actor): Promise<void> {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(field.key)) throw validation(['clé de champ invalide (minuscules, chiffres, tiret bas)']);
    if (!this.fieldTypes.has(field.type)) throw validation([`type de champ inconnu : ${field.type}`]);
    await this.mutate(organizationId, projectKey, trackerKey, actor, `champ ${field.key}`, async (c, tracker) => {
      const used = Number((await c.query('select count(*) n from artifact where tracker_id = $1', [tracker])).rows[0].n);
      if (field.required && used > 0) throw conflict('Un champ obligatoire ne peut pas être ajouté à un tracker qui contient déjà des artefacts.');
      const position = Number((await c.query('select coalesce(max(position) + 1, 0) n from field_definition where tracker_id = $1', [tracker])).rows[0].n);
      await c.query(
        'insert into field_definition (organization_id, tracker_id, key, label, type, config, required, position, semantic_role, read_roles, write_roles) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [organizationId, tracker, field.key, field.label, field.type, JSON.stringify(field.config ?? {}), field.required ?? false, position, field.semanticRole ?? null, field.readRoles ?? null, field.writeRoles ?? null],
      );
    });
  }

  /** Aperçu de l'impact d'un changement de champ, sans rien modifier. */
  async fieldImpact(organizationId: string, projectKey: string, trackerKey: string, fieldKey: string): Promise<{
    artifacts: number; withValue: number; withoutValue: number; isTitle: boolean; canRemoveWithoutPurge: boolean; canBecomeRequired: boolean;
  }> {
    return this.db.tx(organizationId, async (c) => {
      const field = (await c.query(
        `select f.id, f.semantic_role, f.tracker_id from field_definition f join tracker t on t.id = f.tracker_id join project p on p.id = t.project_id
         where p.key = $1 and t.key = $2 and f.key = $3`, [projectKey, trackerKey, fieldKey])).rows[0];
      if (!field) throw notFound(`Champ ${fieldKey}`);
      const counts = (await c.query('select count(*)::int total, count(*) filter (where "values" ? $2)::int with_value from artifact where tracker_id = $1', [field.tracker_id, fieldKey])).rows[0];
      return {
        artifacts: counts.total, withValue: counts.with_value, withoutValue: counts.total - counts.with_value,
        isTitle: field.semantic_role === 'title', canRemoveWithoutPurge: counts.with_value === 0 && field.semantic_role !== 'title',
        canBecomeRequired: counts.total === counts.with_value,
      };
    });
  }

  /** Modifie libellé, caractère obligatoire et rôles d'un champ. La clé et le type sont immuables (les valeurs stockées en dépendent). */
  async updateField(
    organizationId: string, projectKey: string, trackerKey: string, fieldKey: string,
    patch: { label?: string; required?: boolean; readRoles?: string[] | null; writeRoles?: string[] | null }, actor: Actor,
  ): Promise<void> {
    await this.mutate(organizationId, projectKey, trackerKey, actor, `champ ${fieldKey} modifié`, async (c, tracker) => {
      const field = (await c.query('select id, required from field_definition where tracker_id = $1 and key = $2', [tracker, fieldKey])).rows[0];
      if (!field) throw notFound(`Champ ${fieldKey}`);
      if (patch.required === true && !field.required) {
        const missing = Number((await c.query('select count(*) n from artifact where tracker_id = $1 and not ("values" ? $2)', [tracker, fieldKey])).rows[0].n);
        if (missing > 0) throw conflict(`${missing} artefact(s) n'ont pas de valeur pour ${fieldKey} : le champ ne peut pas devenir obligatoire.`);
      }
      await c.query(
        `update field_definition set label = coalesce($2, label), required = coalesce($3, required),
           read_roles = case when $4::boolean then $5 else read_roles end, write_roles = case when $6::boolean then $7 else write_roles end where id = $1`,
        [field.id, patch.label ?? null, patch.required ?? null, patch.readRoles !== undefined, patch.readRoles ?? null, patch.writeRoles !== undefined, patch.writeRoles ?? null],
      );
    });
  }

  /**
   * Supprime un champ. Refusé s'il porte le rôle sémantique « titre » ou si des artefacts ont une valeur,
   * sauf `purge` : les valeurs sont alors retirées des artefacts (les révisions passées les conservent).
   */
  async removeField(organizationId: string, projectKey: string, trackerKey: string, fieldKey: string, purge: boolean, actor: Actor): Promise<void> {
    await this.mutate(organizationId, projectKey, trackerKey, actor, `champ ${fieldKey} supprimé`, async (c, tracker) => {
      const field = (await c.query('select id, semantic_role from field_definition where tracker_id = $1 and key = $2', [tracker, fieldKey])).rows[0];
      if (!field) throw notFound(`Champ ${fieldKey}`);
      if (field.semantic_role === 'title') throw conflict('Le champ titre ne peut pas être supprimé.');
      const used = Number((await c.query('select count(*) n from artifact where tracker_id = $1 and "values" ? $2', [tracker, fieldKey])).rows[0].n);
      if (used > 0 && !purge) throw conflict(`${used} artefact(s) ont une valeur pour ${fieldKey} : supprimer avec purge pour les retirer.`);
      if (used > 0) await c.query('update artifact set "values" = "values" - $2 where tracker_id = $1', [tracker, fieldKey]);
      await c.query('delete from field_definition where id = $1', [field.id]);
    });
  }

  /** Mode d'écriture de l'historique : « direct » (branche principale) ou « merge_request » (changements soumis à revue). */
  async setHistoryMode(organizationId: string, projectKey: string, trackerKey: string, mode: 'direct' | 'merge_request', actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query('update tracker t set history_mode = $3 from project p where p.id = t.project_id and p.key = $1 and t.key = $2', [projectKey, trackerKey, mode]);
      if (result.rowCount === 0) throw notFound(`Tracker ${projectKey}/${trackerKey}`);
      await audit(c, organizationId, actor, 'tracker.history_mode', `tracker:${projectKey}/${trackerKey}`, { mode });
    });
  }

  /** Remplace la disposition de la vue détails ; `null` revient à la disposition automatique. */
  async setLayout(organizationId: string, projectKey: string, trackerKey: string, layout: Layout | null, actor: Actor): Promise<void> {
    await this.mutate(organizationId, projectKey, trackerKey, actor, 'disposition', async (c, tracker) => {
      if (layout) {
        const keys = (await c.query('select key from field_definition where tracker_id = $1', [tracker])).rows.map((r) => r.key as string);
        const problems = layoutProblems(layout, keys);
        if (problems.length) throw validation(problems);
      }
      await c.query('update tracker set layout = $2 where id = $1', [tracker, layout ? JSON.stringify(layout) : null]);
    });
  }

  /** Rattache le tracker à un type (ou le détache avec `null`). */
  async setType(organizationId: string, projectKey: string, trackerKey: string, typeKey: string | null, actor: Actor): Promise<void> {
    await this.mutate(organizationId, projectKey, trackerKey, actor, 'type', async (c, tracker) => {
      if (typeKey !== null && !(await typeExists(c, typeKey))) throw validation([`type de tracker inconnu : ${typeKey}`]);
      await c.query('update tracker set type_key = $2 where id = $1', [tracker, typeKey]);
    });
  }

  async addStatus(organizationId: string, projectKey: string, trackerKey: string, status: StatusSpec, actor: Actor): Promise<void> {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(status.key)) throw validation(['clé de statut invalide']);
    await this.mutate(organizationId, projectKey, trackerKey, actor, `statut ${status.key}`, async (c, tracker) => {
      const position = Number((await c.query('select coalesce(max(position) + 1, 0) n from status where tracker_id = $1', [tracker])).rows[0].n);
      await c.query('insert into status (organization_id, tracker_id, key, name, category, position) values ($1,$2,$3,$4,$5,$6)', [organizationId, tracker, status.key, status.name, status.category, position]);
    });
  }

  async addTransition(organizationId: string, projectKey: string, trackerKey: string, t: TransitionSpec, actor: Actor): Promise<void> {
    await this.mutate(organizationId, projectKey, trackerKey, actor, `transition ${t.name}`, async (c, tracker) => {
      const ids = new Map((await c.query('select key, id from status where tracker_id = $1', [tracker])).rows.map((r) => [r.key as string, r.id as string]));
      if (t.from !== null && !ids.has(t.from)) throw validation([`statut source inconnu : ${t.from}`]);
      if (!ids.has(t.to)) throw validation([`statut cible inconnu : ${t.to}`]);
      await c.query(
        'insert into transition (organization_id, tracker_id, name, from_status_id, to_status_id, conditions, validators, post_actions) values ($1,$2,$3,$4,$5,$6,$7,$8)',
        [organizationId, tracker, t.name, t.from === null ? null : ids.get(t.from), ids.get(t.to), JSON.stringify(t.conditions ?? []), JSON.stringify(t.validators ?? []), JSON.stringify(t.postActions ?? [])],
      );
    });
  }

  private async mutate(
    organizationId: string, projectKey: string, trackerKey: string, actor: Actor, what: string,
    change: (c: PoolClient, trackerId: string) => Promise<void>,
  ): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const tracker = (await c.query('select t.id from tracker t join project p on p.id = t.project_id where p.key = $1 and t.key = $2 for update of t', [projectKey, trackerKey])).rows[0];
      if (!tracker) throw notFound(`Tracker ${projectKey}/${trackerKey}`);
      await change(c, tracker.id as string);
      const version = (await c.query('update tracker set schema_version = schema_version + 1 where id = $1 returning schema_version', [tracker.id])).rows[0].schema_version as number;
      await outbox(c, organizationId, 'tracker', tracker.id as string, 'tracker.updated', { key: trackerKey, project: projectKey, actor: actor.id, change: what, schemaVersion: version });
      await audit(c, organizationId, actor, 'tracker.update', `tracker:${projectKey}/${trackerKey}`, { change: what, schemaVersion: version });
    });
  }

  async getDefinition(c: PoolClient, projectKey: string, trackerKey: string): Promise<TrackerDefinition> {
    const t = (
      await c.query(
        `select t.id, t.project_id, t.key, t.name, t.schema_version, t.history_mode, t.layout, t.type_key from tracker t
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
      typeKey: t.type_key ?? null,
      historyMode: t.history_mode,
      layout: (t.layout as Layout | null) ?? null,
      fields: fields.map((f) => ({
        id: f.id, key: f.key, label: f.label, type: f.type, config: f.config, required: f.required, semanticRole: f.semantic_role, readRoles: f.read_roles ?? null, writeRoles: f.write_roles ?? null,
      })),
      statuses: statuses.map((s) => ({ id: s.id, key: s.key, name: s.name, category: s.category, position: s.position })),
      transitions: transitions.map((x) => ({
        id: x.id, name: x.name, fromStatusId: x.from_status_id, toStatusId: x.to_status_id,
        conditions: x.conditions, validators: x.validators, postActions: x.post_actions,
      })),
    };
  }

  validateSpec(spec: TrackerSpec): void {
    const errors: string[] = [];
    const dup = (items: string[], what: string) => {
      const seen = new Set<string>();
      for (const i of items) (seen.has(i) ? errors.push(`${what} en double : ${i}`) : seen.add(i));
    };
    dup(spec.fields.map((f) => f.key), 'champ');
    dup(spec.statuses.map((s) => s.key), 'statut');
    if (spec.layout) errors.push(...layoutProblems(spec.layout, spec.fields.map((f) => f.key)));
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
