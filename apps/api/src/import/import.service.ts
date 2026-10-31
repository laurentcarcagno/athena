import type { PoolClient } from 'pg';
import { Db, type Actor } from '../core/db';
import { notFound } from '../core/errors';
import type { FieldTypeRegistry } from '../core/field-types';
import { audit, outbox, TrackerService, type TrackerDefinition } from '../core/tracker.service';
import type { ImportRecord } from './sources';

export type ImportSource = 'jira' | 'tuleap';

export interface ImportOptions {
  dryRun: boolean;
  /** Statuts externes → clés de statut Athena, par tracker (ou global). */
  statusMap: Record<string, string>;
  /** Interrompt l'import appliqué au-delà de ce nombre d'erreurs. */
  maxErrors?: number;
}

export interface ImportReport {
  dryRun: boolean;
  total: number;
  created: number;
  skipped: number;
  linked: number;
  errors: Array<{ row: number; key: string; message: string }>;
  warnings: string[];
  unmappedStatuses: string[];
}

/**
 * Import de données JIRA/Tuleap. L'import ne passe pas par le workflow (il reprend un état existant) mais respecte
 * le schéma du tracker : champs connus, types et champs obligatoires validés. Idempotent par `import_map`.
 */
export class ImportService {
  constructor(
    private readonly db: Db,
    private readonly trackers: TrackerService,
    private readonly registry: FieldTypeRegistry,
  ) {}

  async run(organizationId: string, projectKey: string, source: ImportSource, records: ImportRecord[], options: ImportOptions, actor: Actor): Promise<ImportReport> {
    const report: ImportReport = { dryRun: options.dryRun, total: records.length, created: 0, skipped: 0, linked: 0, errors: [], warnings: [], unmappedStatuses: [] };
    const definitions = new Map<string, TrackerDefinition | null>();
    const unmapped = new Set<string>();
    const maxErrors = options.maxErrors ?? 100;

    const projectId = await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      return project.id as string;
    });
    const known = new Set<string>(
      await this.db.tx(organizationId, async (c) =>
        (await c.query('select external_key from import_map where project_id = $1 and source = $2', [projectId, source])).rows.map((r) => r.external_key as string),
      ),
    );

    const prepared: Array<{ record: ImportRecord; def: TrackerDefinition; statusId: string }> = [];
    for (const record of records) {
      if (known.has(record.externalKey)) { report.skipped += 1; continue; }
      let def = definitions.get(record.tracker);
      if (def === undefined) {
        def = await this.db.tx(organizationId, (c) => this.trackers.getDefinition(c, projectKey, record.tracker)).catch(() => null);
        definitions.set(record.tracker, def);
      }
      if (!def) { report.errors.push({ row: record.row, key: record.externalKey, message: `tracker inconnu : ${record.tracker}` }); continue; }
      const statusKey = options.statusMap[record.status];
      const status = statusKey ? def.statuses.find((s) => s.key === statusKey) : undefined;
      if (!status) {
        unmapped.add(record.status);
        report.errors.push({ row: record.row, key: record.externalKey, message: `statut non associé : « ${record.status} »` });
        continue;
      }
      const problems = await this.validate(def, record.values);
      if (problems.length) { report.errors.push({ row: record.row, key: record.externalKey, message: problems.join(' ; ') }); continue; }
      prepared.push({ record, def, statusId: status.id });
    }
    report.unmappedStatuses = [...unmapped].sort();
    if (options.dryRun) {
      report.created = prepared.length;
      return report;
    }
    if (report.errors.length > maxErrors) {
      report.warnings.push(`import interrompu : plus de ${maxErrors} erreurs`);
      return report;
    }

    for (const item of prepared) {
      try {
        await this.db.tx(organizationId, (c) => this.insert(c, organizationId, projectId, projectKey, source, item, actor));
        report.created += 1;
      } catch (error) {
        report.errors.push({ row: item.record.row, key: item.record.externalKey, message: (error as Error).message.slice(0, 200) });
      }
    }
    report.linked = await this.link(organizationId, projectId, source, records, report);
    await this.db.tx(organizationId, (c) =>
      audit(c, organizationId, actor, 'import.run', `project:${projectKey}`, { source, created: report.created, skipped: report.skipped, errors: report.errors.length }),
    );
    return report;
  }

  private async validate(def: TrackerDefinition, values: Record<string, unknown>): Promise<string[]> {
    const problems: string[] = [];
    const fields = new Map(def.fields.map((f) => [f.key, f]));
    for (const [key, value] of Object.entries(values)) {
      const field = fields.get(key);
      if (!field) { problems.push(`champ inconnu : ${key}`); continue; }
      const problem = await this.registry.validate(field.type, value, field.config);
      if (problem) problems.push(`${key} : ${problem}`);
    }
    for (const f of def.fields) if (f.required && values[f.key] === undefined) problems.push(`${f.key} : obligatoire`);
    return problems;
  }

  private async insert(
    c: PoolClient, org: string, projectId: string, projectKey: string, source: ImportSource,
    item: { record: ImportRecord; def: TrackerDefinition; statusId: string }, actor: Actor,
  ): Promise<void> {
    const { record, def, statusId } = item;
    const number = Number((await c.query('select next_artifact_number($1) n', [def.id])).rows[0].n);
    const key = `${def.key}-${number}`;
    const created = record.createdAt ?? new Date().toISOString();
    const id = (
      await c.query(
        `insert into artifact (organization_id, project_id, tracker_id, number, key, status_id, "values", created_by, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning id`,
        [org, projectId, def.id, number, key, statusId, JSON.stringify(record.values), `import:${source}`, created],
      )
    ).rows[0].id as string;
    const status = def.statuses.find((s) => s.id === statusId)!.key;
    const snapshot = { key, tracker: def.key, status, version: 1, values: record.values };
    const diff = Object.fromEntries(Object.entries(record.values).map(([k, v]) => [k, { from: null, to: v }]));
    const revision = (
      await c.query('insert into artifact_revision (organization_id, artifact_id, version, diff, actor, snapshot, created_at) values ($1,$2,1,$3,$4,$5,$6) returning event_id', [org, id, JSON.stringify(diff), `import:${source}`, JSON.stringify(snapshot), created])
    ).rows[0];
    await outbox(c, org, 'artifact', id, 'artifact.created', { eventId: revision.event_id, key, version: 1, actor: `import:${source}`, values: record.values, imported: record.externalKey });
    await c.query('insert into import_map (organization_id, project_id, source, external_key, artifact_key) values ($1,$2,$3,$4,$5)', [org, projectId, source, record.externalKey, key]);
    void projectKey;
    void actor;
  }

  /** Crée les liens entre artefacts importés (cibles résolues par `import_map`, y compris les imports précédents). */
  private async link(org: string, projectId: string, source: ImportSource, records: ImportRecord[], report: ImportReport): Promise<number> {
    let created = 0;
    for (const record of records) {
      for (const link of record.links) {
        try {
          const done = await this.db.tx(org, async (c) => {
            const from = (await c.query('select a.id from import_map m join artifact a on a.key = m.artifact_key and a.project_id = m.project_id where m.project_id = $1 and m.source = $2 and m.external_key = $3', [projectId, source, record.externalKey])).rows[0];
            const to = (await c.query('select a.id from import_map m join artifact a on a.key = m.artifact_key and a.project_id = m.project_id where m.project_id = $1 and m.source = $2 and m.external_key = $3', [projectId, source, link.target])).rows[0];
            const type = (await c.query('select id from link_type where project_id = $1 and key = $2', [projectId, link.type])).rows[0];
            if (!from || !to || !type) {
              report.warnings.push(`lien ${record.externalKey} → ${link.target} ignoré (${!type ? `type ${link.type} inconnu` : 'artefact non importé'})`);
              return 0;
            }
            return (await c.query('insert into artifact_link (organization_id, from_artifact_id, to_artifact_id, link_type_id) values ($1,$2,$3,$4) on conflict do nothing', [org, from.id, to.id, type.id])).rowCount ?? 0;
          });
          created += done;
        } catch (error) {
          report.warnings.push(`lien ${record.externalKey} → ${link.target} : ${(error as Error).message.slice(0, 100)}`);
        }
      }
    }
    return created;
  }
}
