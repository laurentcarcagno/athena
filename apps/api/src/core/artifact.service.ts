import type { PoolClient } from 'pg';
import { Db, type Actor } from './db';
import { conflict, forbidden, notFound, validation } from './errors';
import { FieldTypeRegistry } from './field-types';
import { formatKey } from './key';
import { audit, outbox, TrackerService, type TrackerDefinition } from './tracker.service';

export interface Artifact {
  id: string;
  key: string;
  trackerKey: string;
  status: string;
  values: Record<string, unknown>;
  version: number;
}

type Values = Record<string, unknown>;
export interface Snapshot {
  key: string;
  tracker: string;
  status: string;
  version: number;
  values: Values;
}
type Diff = Record<string, { from: unknown; to: unknown }>;

const canUse = (restricted: string[] | null | undefined, roles: string[]): boolean =>
  !restricted || roles.includes('athena-admin') || restricted.some((r) => roles.includes(r));

/** Valeurs visibles par un lecteur : les champs à lecture restreinte sont retirés. */
export function visibleValues(def: TrackerDefinition, values: Record<string, unknown>, roles: string[]): Record<string, unknown> {
  const hidden = new Set(def.fields.filter((f) => !canUse(f.readRoles, roles)).map((f) => f.key));
  return hidden.size === 0 ? values : Object.fromEntries(Object.entries(values).filter(([k]) => !hidden.has(k)));
}

/** Refuse l'écriture de champs à écriture restreinte pour un acteur sans le rôle requis. */
function assertWritable(def: TrackerDefinition, keys: string[], actor: Actor): void {
  const denied = def.fields.filter((f) => keys.includes(f.key) && !canUse(f.writeRoles, actor.roles)).map((f) => f.key);
  if (denied.length) throw forbidden(`Écriture interdite sur : ${denied.join(', ')}.`);
}

export class ArtifactService {
  constructor(
    private readonly db: Db,
    private readonly trackers: TrackerService,
    private readonly fieldTypes: FieldTypeRegistry,
  ) {}

  async create(
    organizationId: string, projectKey: string, trackerKey: string, values: Values, actor: Actor,
  ): Promise<Artifact> {
    return this.db.tx(organizationId, async (c) => {
      const def = await this.trackers.getDefinition(c, projectKey, trackerKey);
      assertWritable(def, Object.keys(values), actor);
      await this.validateValues(def, values, true);
      const initial = def.statuses.find((s) => s.category === 'todo');
      if (!initial) throw validation(['aucun statut initial']);
      const number = Number((await c.query('select next_artifact_number($1) n', [def.id])).rows[0].n);
      const key = formatKey(projectKey, def.key, number);
      const id = (
        await c.query(
          `insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [organizationId, def.projectId, def.id, number, key, initial.id, JSON.stringify(values), actor.id],
        )
      ).rows[0].id as string;
      const diff: Diff = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { from: null, to: v }]));
      await this.record(c, organizationId, id, 1, diff, actor, 'artifact.created', key, { values },
        { key, tracker: trackerKey, status: initial.key, version: 1, values });
      return { id, key, trackerKey, status: initial.key, values, version: 1 };
    });
  }

  /** Avec `viewer`, les champs à lecture restreinte sont retirés des valeurs. */
  async get(organizationId: string, projectKey: string, key: string, viewer?: Actor): Promise<Artifact> {
    return this.db.tx(organizationId, async (c) => {
      const row = await this.load(c, projectKey, key, false);
      const artifact = this.toArtifact(row);
      if (!viewer) return artifact;
      const def = await this.trackers.getDefinition(c, projectKey, row.tracker_key);
      return { ...artifact, values: visibleValues(def, artifact.values, viewer.roles) };
    });
  }

  async update(
    organizationId: string, projectKey: string, key: string, patch: Values, expectedVersion: number, actor: Actor,
  ): Promise<Artifact> {
    return this.db.tx(organizationId, async (c) => {
      const row = await this.load(c, projectKey, key, true);
      if (row.version !== expectedVersion) {
        throw conflict(`Version attendue ${expectedVersion}, version courante ${row.version}.`);
      }
      const def = await this.trackers.getDefinition(c, projectKey, row.tracker_key);
      assertWritable(def, Object.keys(patch), actor);
      const next: Values = { ...row.values };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      await this.validateValues(def, next, true);
      const diff = diffOf(row.values, next);
      if (Object.keys(diff).length === 0) return this.toArtifact(row);
      const version = row.version + 1;
      await c.query(`update artifact set "values" = $1, version = $2, updated_at = now() where id = $3`, [
        JSON.stringify(next), version, row.id,
      ]);
      // Les liens pointant vers cet artefact deviennent suspects tant qu'un humain ne les a pas revus, mais seulement si un champ
      // de contenu a changé (pas la priorité ou le responsable) et si le type du lien propage la suspicion.
      const contentChanged = Object.keys(diff).some((k) => def.fields.find((f) => f.key === k)?.isContent !== false);
      if (contentChanged) {
        await c.query(
          `update artifact_link l set suspect = true from link_type t
           where t.id = l.link_type_id and t.propagates_suspect and l.to_artifact_id = $1 and not l.suspect`,
          [row.id],
        );
      }
      await this.record(c, organizationId, row.id, version, diff, actor, 'artifact.updated', row.key, { changes: diff },
        { key: row.key, tracker: row.tracker_key, status: row.status_key, version, values: next });
      return { ...this.toArtifact(row), values: next, version };
    });
  }

  /**
   * Restaure les valeurs d'une révision antérieure. Ce n'est jamais une réécriture : une nouvelle révision
   * (et donc un nouveau commit d'historique) est créée. Le statut n'est pas restauré : il ne change que par transition.
   */
  async restore(
    organizationId: string, projectKey: string, key: string, targetVersion: number, expectedVersion: number, actor: Actor,
  ): Promise<Artifact> {
    const snapshot = await this.db.tx(organizationId, async (c) => {
      const row = (
        await c.query(
          `select r.snapshot, a."values" as current from artifact_revision r join artifact a on a.id = r.artifact_id
           join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2) and r.version = $3`,
          [projectKey, key, targetVersion],
        )
      ).rows[0];
      if (!row) throw notFound(`Révision ${targetVersion} de ${key}`);
      if (!row.snapshot) throw validation([`la révision ${targetVersion} n'a pas d'instantané`]);
      return { values: (row.snapshot as { values: Values }).values, current: row.current as Values };
    });
    const patch: Values = { ...snapshot.values };
    for (const k of Object.keys(snapshot.current)) if (!(k in snapshot.values)) patch[k] = null;
    const restored = await this.update(organizationId, projectKey, key, patch, expectedVersion, actor);
    await this.db.tx(organizationId, (c) => audit(c, organizationId, actor, 'artifact.restore', `artifact:${restored.key}`, { fromVersion: targetVersion, toVersion: restored.version }));
    return restored;
  }

  async transition(
    organizationId: string, projectKey: string, key: string, transitionName: string, expectedVersion: number, actor: Actor,
  ): Promise<Artifact> {
    return this.db.tx(organizationId, async (c) => {
      const row = await this.load(c, projectKey, key, true);
      if (row.version !== expectedVersion) {
        throw conflict(`Version attendue ${expectedVersion}, version courante ${row.version}.`);
      }
      const def = await this.trackers.getDefinition(c, projectKey, row.tracker_key);
      const transition = def.transitions.find(
        (t) => t.name === transitionName && (t.fromStatusId === null || t.fromStatusId === row.status_id),
      );
      if (!transition) throw conflict(`Transition « ${transitionName} » impossible depuis l'état courant.`);

      for (const condition of transition.conditions as Array<{ type: string; roles?: string[] }>) {
        if (condition.type === 'role' && !condition.roles?.some((r) => actor.roles.includes(r))) {
          throw forbidden(`Transition « ${transitionName} » réservée aux rôles : ${condition.roles?.join(', ')}.`);
        }
      }
      const problems: string[] = [];
      for (const validator of transition.validators as Array<{ type: string; fields?: string[] }>) {
        if (validator.type === 'backports_done') {
          const pending = (await c.query("select branch from backport where artifact_id = $1 and state = 'pending' order by branch", [row.id])).rows.map((r) => r.branch as string);
          if (pending.length) problems.push(`rétroportages en attente : ${pending.join(', ')}`);
        }
        if (validator.type === 'required_fields') {
          for (const f of validator.fields ?? []) if (row.values[f] === undefined) problems.push(`champ requis : ${f}`);
        }
      }
      if (problems.length) throw validation(problems);

      const to = def.statuses.find((s) => s.id === transition.toStatusId)!;
      const from = def.statuses.find((s) => s.id === row.status_id)!;
      const version = row.version + 1;
      await c.query('update artifact set status_id = $1, version = $2, updated_at = now() where id = $3', [
        to.id, version, row.id,
      ]);
      await this.record(c, organizationId, row.id, version, { status: { from: from.key, to: to.key } }, actor,
        'artifact.transitioned', row.key, { transition: transitionName, from: from.key, to: to.key, postActions: transition.postActions },
        { key: row.key, tracker: row.tracker_key, status: to.key, version, values: row.values });
      return { ...this.toArtifact(row), status: to.key, version };
    });
  }

  private async validateValues(def: TrackerDefinition, values: Values, checkRequired: boolean): Promise<void> {
    const errors: string[] = [];
    const fields = new Map(def.fields.map((f) => [f.key, f]));
    for (const [k, v] of Object.entries(values)) {
      const field = fields.get(k);
      if (!field) { errors.push(`champ inconnu : ${k}`); continue; }
      const problem = await this.fieldTypes.validate(field.type, v, field.config);
      if (problem) errors.push(`${k} : ${problem}`);
    }
    if (checkRequired) {
      for (const f of def.fields) if (f.required && values[f.key] === undefined) errors.push(`${f.key} : obligatoire`);
    }
    if (errors.length) throw validation(errors);
  }

  private async load(c: PoolClient, projectKey: string, key: string, lock: boolean) {
    const row = (
      await c.query(
        `select a.id, a.key, a.version, a.status_id, a."values" as values, s.key as status_key, t.key as tracker_key
         from artifact a join project p on p.id = a.project_id
         join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id
         where p.key = $1 and a.id = resolve_artifact(p.id, $2) ${lock ? 'for update of a' : ''}`,
        [projectKey, key],
      )
    ).rows[0];
    if (!row) throw notFound(`Artefact ${key}`);
    return row;
  }

  private toArtifact(row: { id: string; key: string; tracker_key: string; status_key: string; values: Values; version: number }): Artifact {
    return { id: row.id, key: row.key, trackerKey: row.tracker_key, status: row.status_key, values: row.values, version: row.version };
  }

  private async record(
    c: PoolClient, org: string, artifactId: string, version: number, diff: Diff, actor: Actor,
    eventType: string, key: string, payload: Record<string, unknown>, snapshot: Snapshot,
  ): Promise<void> {
    const revision = await c.query(
      'insert into artifact_revision (organization_id, artifact_id, version, diff, actor, snapshot) values ($1,$2,$3,$4,$5,$6) returning event_id',
      [org, artifactId, version, JSON.stringify(diff), actor.id, JSON.stringify(snapshot)],
    );
    await outbox(c, org, 'artifact', artifactId, eventType, {
      eventId: revision.rows[0].event_id, key, version, actor: actor.id, ...payload,
    });
    await audit(c, org, actor, eventType, `artifact:${key}`, { version });
  }
}

function diffOf(before: Values, after: Values): Diff {
  const diff: Diff = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) diff[k] = { from: before[k] ?? null, to: after[k] ?? null };
  }
  return diff;
}
