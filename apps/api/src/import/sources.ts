import { z } from 'zod';
import { parseCsv } from './csv';

export interface ImportRecord {
  externalKey: string;
  tracker: string;
  /** Statut externe (avant traduction). */
  status: string;
  values: Record<string, unknown>;
  links: Array<{ type: string; target: string }>;
  createdAt?: string;
  row: number;
}

export const JiraConfigSchema = z.object({
  trackerByType: z.record(z.string(), z.string()),
  defaultTracker: z.string().optional(),
  statusMap: z.record(z.string(), z.string()),
  /** Colonne JIRA → clé de champ Athena. */
  fieldMap: z.record(z.string(), z.string()),
  /** Clé de champ Athena → traduction des valeurs (ex. priorité). */
  valueMaps: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  /** Nom du lien JIRA (« Blocks ») → clé du type de lien Athena. */
  linkTypes: z.record(z.string(), z.string()).default({}),
  /** Champ Athena recevant la clé JIRA d'origine (traçabilité), s'il existe dans le tracker. */
  externalKeyField: z.string().optional(),
});
export type JiraConfig = z.infer<typeof JiraConfigSchema>;

const NUMERIC = /^-?\d+(\.\d+)?$/;
const lower = (s: string) => s.trim().toLowerCase();

/** Convertit un export CSV JIRA en enregistrements. Les colonnes répétées (Labels, liens) sont regroupées. */
export function parseJiraCsv(csv: string, config: JiraConfig): { records: ImportRecord[]; errors: Array<{ row: number; message: string }> } {
  const rows = parseCsv(csv);
  const header = rows[0];
  if (!header) return { records: [], errors: [{ row: 0, message: 'fichier vide' }] };
  const index = (name: string) => header.findIndex((h) => lower(h) === lower(name));
  const keyCol = index('Issue key');
  const typeCol = index('Issue Type');
  const statusCol = index('Status');
  const createdCol = index('Created');
  if (keyCol < 0 || typeCol < 0 || statusCol < 0) return { records: [], errors: [{ row: 1, message: 'colonnes obligatoires absentes : Issue key, Issue Type, Status' }] };
  const linkCols = header.map((h, i) => ({ i, m: /^outward issue link \((.+)\)$/i.exec(h.trim()) })).filter((c) => c.m).map((c) => ({ i: c.i, name: c.m![1]! }));

  const records: ImportRecord[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  rows.slice(1).forEach((cells, offset) => {
    const row = offset + 2;
    const externalKey = (cells[keyCol] ?? '').trim();
    if (!externalKey) { errors.push({ row, message: 'clé JIRA absente' }); return; }
    const type = (cells[typeCol] ?? '').trim();
    const tracker = config.trackerByType[type] ?? config.defaultTracker;
    if (!tracker) { errors.push({ row, message: `${externalKey} : type JIRA non associé à un tracker (${type})` }); return; }

    const values: Record<string, unknown> = {};
    for (const [column, fieldKey] of Object.entries(config.fieldMap)) {
      const positions = header.map((h, i) => (lower(h) === lower(column) ? i : -1)).filter((i) => i >= 0);
      const raw = positions.map((i) => (cells[i] ?? '').trim()).filter(Boolean);
      if (raw.length === 0) continue;
      const mapped = raw.map((v) => config.valueMaps[fieldKey]?.[v] ?? v);
      values[fieldKey] = positions.length > 1 ? mapped : NUMERIC.test(mapped[0]!) && /points|estimate|storypoints/i.test(fieldKey) ? Number(mapped[0]) : mapped[0];
    }
    if (config.externalKeyField) values[config.externalKeyField] = externalKey;

    const links = linkCols.flatMap((c) => {
      const target = (cells[c.i] ?? '').trim();
      const type = config.linkTypes[c.name];
      return target && type ? [{ type, target }] : [];
    });
    const created = createdCol >= 0 ? new Date((cells[createdCol] ?? '').trim()) : null;
    records.push({
      externalKey, tracker, status: (cells[statusCol] ?? '').trim(), values, links,
      ...(created && !Number.isNaN(created.getTime()) ? { createdAt: created.toISOString() } : {}), row,
    });
  });
  return { records, errors };
}

export const TuleapConfigSchema = z.object({
  tracker: z.string(),
  statusMap: z.record(z.string(), z.string()),
  /** Libellé du champ Tuleap → clé de champ Athena. */
  fieldMap: z.record(z.string(), z.string()),
  valueMaps: z.record(z.string(), z.record(z.string(), z.string())).default({}),
  externalKeyField: z.string().optional(),
});
export type TuleapConfig = z.infer<typeof TuleapConfigSchema>;

interface TuleapValue { label?: string; value?: unknown; bind_value_objects?: Array<{ label?: string }>; values?: Array<{ label?: string } | string> }
interface TuleapArtifact { id: number | string; title?: string; status?: string; submitted_on?: string; values?: TuleapValue[] }

/** Convertit les artefacts de l'API REST Tuleap (`GET /api/trackers/{id}/artifacts?values=all`) en enregistrements. */
export function parseTuleapArtifacts(json: unknown, config: TuleapConfig): { records: ImportRecord[]; errors: Array<{ row: number; message: string }> } {
  const list: TuleapArtifact[] = Array.isArray(json) ? json : Array.isArray((json as { collection?: unknown })?.collection) ? (json as { collection: TuleapArtifact[] }).collection : [];
  if (list.length === 0) return { records: [], errors: [{ row: 0, message: 'aucun artefact Tuleap dans le fichier' }] };
  const records: ImportRecord[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  list.forEach((artifact, offset) => {
    const row = offset + 1;
    if (artifact?.id === undefined) { errors.push({ row, message: 'identifiant Tuleap absent' }); return; }
    const externalKey = String(artifact.id);
    const values: Record<string, unknown> = {};
    for (const v of artifact.values ?? []) {
      const fieldKey = v.label ? config.fieldMap[v.label] : undefined;
      if (!fieldKey) continue;
      const labels = (v.bind_value_objects ?? []).map((o) => o.label).filter(Boolean) as string[];
      const listed = (v.values ?? []).map((o) => (typeof o === 'string' ? o : o?.label)).filter(Boolean) as string[];
      const raw: unknown = labels.length ? (labels.length === 1 ? labels[0] : labels) : listed.length ? listed : v.value;
      if (raw === undefined || raw === null || raw === '') continue;
      values[fieldKey] = typeof raw === 'string' ? config.valueMaps[fieldKey]?.[raw] ?? raw : raw;
    }
    if (artifact.title && !Object.values(config.fieldMap).includes('title')) values['title'] = artifact.title;
    if (config.externalKeyField) values[config.externalKeyField] = externalKey;
    const created = artifact.submitted_on ? new Date(artifact.submitted_on) : null;
    records.push({
      externalKey, tracker: config.tracker, status: artifact.status ?? '', values, links: [],
      ...(created && !Number.isNaN(created.getTime()) ? { createdAt: created.toISOString() } : {}), row,
    });
  });
  return { records, errors };
}
