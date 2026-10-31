import { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import { conflict, notFound, validation } from '../core/errors';
import { audit, TrackerService } from '../core/tracker.service';

export interface ColumnSpec {
  name: string;
  statuses: string[];
  wipLimit?: number;
}

export interface Card {
  key: string;
  tracker: string;
  title: string;
  status: string;
  assignee: string | null;
  version: number;
}

export interface BoardView {
  key: string;
  name: string;
  columns: Array<{ name: string; wipLimit: number | null; count: number; overLimit: boolean; cards: Card[] }>;
  unmapped: number;
}

export class BoardService {
  constructor(
    private readonly db: Db,
    private readonly trackers: TrackerService,
    private readonly artifacts: ArtifactService,
  ) {}

  async create(
    organizationId: string, projectKey: string, input: { key: string; name: string; trackerKeys: string[]; columns: ColumnSpec[] }, actor: Actor,
  ): Promise<void> {
    const errors: string[] = [];
    if (input.columns.length < 1 || input.columns.length > 12) errors.push('1 à 12 colonnes');
    const seen = new Set<string>();
    for (const column of input.columns) {
      if (column.wipLimit !== undefined && (!Number.isInteger(column.wipLimit) || column.wipLimit < 1)) errors.push(`${column.name} : limite WIP invalide`);
      for (const status of column.statuses) {
        if (seen.has(status)) errors.push(`statut ${status} présent dans deux colonnes`);
        seen.add(status);
      }
    }
    if (errors.length) throw validation(errors);
    await this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      for (const tracker of input.trackerKeys) {
        const def = await this.trackers.getDefinition(c, projectKey, tracker);
        const known = new Set(def.statuses.map((s) => s.key));
        const unknown = [...seen].filter((s) => !known.has(s) && input.trackerKeys.length === 1);
        if (unknown.length) throw validation([`statuts inconnus du tracker ${tracker} : ${unknown.join(', ')}`]);
      }
      await c.query(
        'insert into board (organization_id, project_id, key, name, tracker_keys, columns) values ($1,$2,$3,$4,$5,$6)',
        [organizationId, project.id, input.key, input.name, input.trackerKeys, JSON.stringify(input.columns)],
      );
      await audit(c, organizationId, actor, 'board.create', `board:${projectKey}/${input.key}`);
    });
  }

  async view(organizationId: string, projectKey: string, boardKey: string): Promise<BoardView> {
    return this.db.tx(organizationId, async (c) => {
      const board = await this.load(c, projectKey, boardKey);
      const rows = (
        await c.query(
          `select a.key, a.version, a."values" as values, t.key as tracker, s.key as status,
                  (select f.key from field_definition f where f.tracker_id = t.id and f.semantic_role = 'title') as title_field,
                  (select f.key from field_definition f where f.tracker_id = t.id and f.semantic_role = 'assignee') as assignee_field
           from artifact a join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id join project p on p.id = a.project_id
           where p.key = $1 and t.key = any($2) order by a.created_at, a.id`,
          [projectKey, board.tracker_keys],
        )
      ).rows;
      const columns = (board.columns as ColumnSpec[]).map((spec) => ({
        name: spec.name, wipLimit: spec.wipLimit ?? null, count: 0, overLimit: false, cards: [] as Card[],
      }));
      let unmapped = 0;
      for (const r of rows) {
        const index = (board.columns as ColumnSpec[]).findIndex((spec) => spec.statuses.includes(r.status));
        if (index < 0) { unmapped++; continue; }
        columns[index]!.cards.push({
          key: r.key, tracker: r.tracker, status: r.status, version: r.version,
          title: String(r.values[r.title_field ?? 'title'] ?? r.key),
          assignee: r.assignee_field && r.values[r.assignee_field] ? String(r.values[r.assignee_field]) : null,
        });
      }
      for (const column of columns) {
        column.count = column.cards.length;
        column.overLimit = column.wipLimit !== null && column.count > column.wipLimit;
      }
      return { key: boardKey, name: board.name, columns, unmapped };
    });
  }

  /**
   * Déplace une carte vers une colonne en appliquant la transition de workflow qui y mène.
   * Le déplacement ne contourne ni les conditions ni les validateurs, et respecte la limite WIP.
   */
  async moveCard(
    organizationId: string, projectKey: string, boardKey: string, artifactKey: string, columnName: string, version: number, actor: Actor,
  ) {
    const plan = await this.db.tx(organizationId, async (c) => {
      const board = await this.load(c, projectKey, boardKey);
      const column = (board.columns as ColumnSpec[]).find((x) => x.name === columnName);
      if (!column) throw notFound(`Colonne ${columnName}`);
      const artifact = (
        await c.query(
          `select a.status_id, s.key as status, t.key as tracker from artifact a join tracker t on t.id = a.tracker_id
           join status s on s.id = a.status_id join project p on p.id = a.project_id where p.key = $1 and a.key = $2`,
          [projectKey, artifactKey],
        )
      ).rows[0];
      if (!artifact) throw notFound(`Artefact ${artifactKey}`);
      if (!board.tracker_keys.includes(artifact.tracker)) throw validation([`${artifactKey} n'appartient pas à ce board`]);
      if (column.statuses.includes(artifact.status)) return null;
      if (column.wipLimit !== undefined) {
        const inColumn = Number(
          (
            await c.query(
              `select count(*) n from artifact a join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id join project p on p.id = a.project_id
               where p.key = $1 and t.key = any($2) and s.key = any($3)`,
              [projectKey, board.tracker_keys, column.statuses],
            )
          ).rows[0].n,
        );
        if (inColumn >= column.wipLimit) throw conflict(`Limite WIP atteinte pour « ${column.name} » (${column.wipLimit}).`);
      }
      const def = await this.trackers.getDefinition(c, projectKey, artifact.tracker);
      const targets = new Set(def.statuses.filter((s) => column.statuses.includes(s.key)).map((s) => s.id));
      const candidates = def.transitions.filter((t) => targets.has(t.toStatusId) && (t.fromStatusId === artifact.status_id || t.fromStatusId === null));
      candidates.sort((a, b) => Number(b.fromStatusId === artifact.status_id) - Number(a.fromStatusId === artifact.status_id));
      if (!candidates.length) throw conflict(`Aucune transition ne mène de « ${artifact.status} » à la colonne « ${column.name} ».`);
      return candidates[0]!.name;
    });
    if (plan === null) return this.artifacts.get(organizationId, projectKey, artifactKey);
    return this.artifacts.transition(organizationId, projectKey, artifactKey, plan, version, actor);
  }

  private async load(c: import('pg').PoolClient, projectKey: string, boardKey: string) {
    const row = (
      await c.query('select b.* from board b join project p on p.id = b.project_id where p.key = $1 and b.key = $2', [projectKey, boardKey])
    ).rows[0];
    if (!row) throw notFound(`Board ${boardKey}`);
    return row;
  }
}
