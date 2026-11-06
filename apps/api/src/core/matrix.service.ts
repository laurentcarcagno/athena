import { Db } from './db';
import { notFound, validation } from './errors';

export interface MatrixItem { key: string; title: string; status: string; statusName: string; category: string }
export interface MatrixRow extends MatrixItem {
  /** Au moins un lien de ce type avec un item du tracker en colonnes, même hors de la fenêtre de colonnes affichée. */
  linked: boolean;
}
export interface Matrix {
  type: { key: string; outwardLabel: string; inwardLabel: string };
  rows: MatrixRow[];
  cols: MatrixItem[];
  totalRows: number;
  totalCols: number;
  /** Lignes du tracker (toutes, pas seulement la tuile) sans aucun lien de ce type avec le tracker en colonnes. */
  uncoveredRows: number;
  /** Cases remplies de la fenêtre affichée. */
  links: Array<{ row: string; col: string; suspect: boolean }>;
}
export interface MatrixOptions { colOffset?: number; colLimit?: number; rowOffset?: number; rowLimit?: number }

export const MATRIX_MAX_COLS = 200;
export const MATRIX_MAX_ROWS = 500;

/**
 * Matrice de traçabilité : les items d'un tracker (lignes) croisés avec ceux d'un autre (colonnes) par un type de lien,
 * dans un sens comme dans l'autre. Lignes (500) et colonnes (200) se chargent par tuiles pour qu'un client les affiche en défilement virtuel ; l'indicateur « couvert » des lignes,
 * lui, porte sur toutes les colonnes.
 */
export class MatrixService {
  constructor(private readonly db: Db) {}

  async matrix(organizationId: string, projectKey: string, rowsTracker: string, colsTracker: string, typeKey: string, roles: string[], options: MatrixOptions = {}): Promise<Matrix> {
    const colLimit = Math.min(Math.max(options.colLimit ?? MATRIX_MAX_COLS, 1), MATRIX_MAX_COLS);
    const rowLimit = Math.min(Math.max(options.rowLimit ?? MATRIX_MAX_ROWS, 1), MATRIX_MAX_ROWS);
    const colOffset = Math.max(options.colOffset ?? 0, 0);
    const rowOffset = Math.max(options.rowOffset ?? 0, 0);
    if (!Number.isInteger(colOffset) || !Number.isInteger(rowOffset)) throw validation(['décalage de colonnes invalide']);
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const tracker = async (key: string) => {
        const row = (await c.query('select id from tracker where project_id = $1 and key = $2', [project.id, key])).rows[0];
        if (!row) throw notFound(`Tracker ${key}`);
        return row.id as string;
      };
      const rowsId = await tracker(rowsTracker);
      const colsId = await tracker(colsTracker);
      const type = (await c.query(
        `select id, key, outward_label, inward_label from link_type where key = $2 and (project_id = $1 or project_id is null) order by project_id nulls last limit 1`,
        [project.id, typeKey],
      )).rows[0];
      if (!type) throw notFound(`Type de lien ${typeKey}`);

      const readable = async (trackerId: string): Promise<{ field: string; ok: boolean }> => {
        const f = (await c.query("select key, read_roles from field_definition where tracker_id = $1 and semantic_role = 'title'", [trackerId])).rows[0];
        return { field: (f?.key as string | undefined) ?? 'title', ok: !f?.read_roles || roles.includes('athena-admin') || (f.read_roles as string[]).some((r) => roles.includes(r)) };
      };
      const [rowTitle, colTitle] = [await readable(rowsId), await readable(colsId)];
      const item = (r: Record<string, unknown>, title: { field: string; ok: boolean }): MatrixItem => ({
        key: r.key as string, title: title.ok ? String((r.values as Record<string, unknown>)[title.field] ?? r.key) : (r.key as string),
        status: r.status as string, statusName: r.status_name as string, category: r.category as string,
      });
      const select = `a.id, a.key, a."values" as values, s.key as status, s.name as status_name, s.category`;
      const rows = (await c.query(
        `select ${select}, exists (select 1 from artifact_link l join artifact o on o.id = case when l.from_artifact_id = a.id then l.to_artifact_id else l.from_artifact_id end
                                   where l.link_type_id = $2 and (l.from_artifact_id = a.id or l.to_artifact_id = a.id) and o.tracker_id = $3) as linked
         from artifact a join status s on s.id = a.status_id where a.tracker_id = $1 order by a.number offset ${rowOffset} limit ${rowLimit}`,
        [rowsId, type.id, colsId],
      )).rows;
      const cols = (await c.query(`select ${select} from artifact a join status s on s.id = a.status_id where a.tracker_id = $1 order by a.number offset $2 limit ${colLimit}`, [colsId, colOffset])).rows;
      const totalRows = Number((await c.query('select count(*) n from artifact where tracker_id = $1', [rowsId])).rows[0].n);
      const totalCols = Number((await c.query('select count(*) n from artifact where tracker_id = $1', [colsId])).rows[0].n);
      const uncoveredRows = Number((await c.query(
        `select count(*) n from artifact a where a.tracker_id = $1 and not exists (select 1 from artifact_link l join artifact o on o.id = case when l.from_artifact_id = a.id then l.to_artifact_id else l.from_artifact_id end
                                   where l.link_type_id = $2 and (l.from_artifact_id = a.id or l.to_artifact_id = a.id) and o.tracker_id = $3)`,
        [rowsId, type.id, colsId],
      )).rows[0].n);
      const rowIds = rows.map((r) => r.id as string);
      const colIds = cols.map((r) => r.id as string);
      const linkRows = rowIds.length === 0 || colIds.length === 0 ? [] : (await c.query(
        `select f.key as from_key, t.key as to_key, l.from_artifact_id, l.to_artifact_id, l.suspect from artifact_link l
         join artifact f on f.id = l.from_artifact_id join artifact t on t.id = l.to_artifact_id
         where l.link_type_id = $1 and ((l.from_artifact_id = any($2) and l.to_artifact_id = any($3)) or (l.from_artifact_id = any($3) and l.to_artifact_id = any($2)))`,
        [type.id, rowIds, colIds],
      )).rows;
      const links = new Map<string, { row: string; col: string; suspect: boolean }>();
      for (const l of linkRows) {
        const fromIsRow = rowIds.includes(l.from_artifact_id as string) && colIds.includes(l.to_artifact_id as string);
        const [row, col] = fromIsRow ? [l.from_key as string, l.to_key as string] : [l.to_key as string, l.from_key as string];
        const prior = links.get(`${row}|${col}`);
        links.set(`${row}|${col}`, { row, col, suspect: (prior?.suspect ?? false) || (l.suspect as boolean) });
      }
      return {
        type: { key: type.key as string, outwardLabel: type.outward_label as string, inwardLabel: type.inward_label as string },
        rows: rows.map((r) => ({ ...item(r, rowTitle), linked: r.linked as boolean })), cols: cols.map((r) => item(r, colTitle)),
        totalRows, totalCols, uncoveredRows, links: [...links.values()],
      };
    });
  }
}
