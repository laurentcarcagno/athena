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
  statusName: string;
  /** Teinte nommée du statut (T-0138), nulle : celle de la catégorie. */
  statusColor: string | null;
  assignee: string | null;
  version: number;
  /** Nom du tracker (type du ticket). */
  trackerName: string;
  /** Nom lisible du responsable (compte connu), sinon son identifiant. */
  assigneeName: string | null;
  /** Valeur du champ de rôle `priority` (libellé du champ dans `priorityLabel`). */
  priority: string | null;
  priorityLabel: string | null;
  /** Valeur du champ de rôle `due_date` (AAAA-MM-JJ). */
  due: string | null;
  /** Vrai si un ticket non terminé le bloque (lien entrant `blocks`). */
  blocked: boolean;
}

export interface BoardView {
  key: string;
  name: string;
  /** Trackers du board (le premier reçoit les tickets créés depuis une colonne). */
  trackers: string[];
  /** `creatable` : la colonne contient un statut initial (catégorie « à faire ») ; on peut y créer un ticket. */
  columns: Array<{ name: string; wipLimit: number | null; count: number; overLimit: boolean; creatable: boolean; cards: Card[] }>;
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

  async list(organizationId: string, projectKey: string): Promise<Array<{ key: string; name: string; trackerKeys: string[] }>> {
    return this.db.tx(organizationId, async (c) =>
      (await c.query('select b.key, b.name, b.tracker_keys from board b join project p on p.id = b.project_id where p.key = $1 order by b.key', [projectKey])).rows.map(
        (r) => ({ key: r.key, name: r.name, trackerKeys: r.tracker_keys }),
      ),
    );
  }

  /** `roles` : rôles du lecteur. Titre ou responsable à lecture restreinte masqués s'il ne les a pas (sans `roles` : usage interne). */
  async view(organizationId: string, projectKey: string, boardKey: string, roles?: string[]): Promise<BoardView> {
    return this.db.tx(organizationId, async (c) => {
      const board = await this.load(c, projectKey, boardKey);
      const rows = (
        await c.query(
          `select a.key, a.version, a."values" as values, t.id as tracker_id, t.key as tracker, t.name as tracker_name, s.key as status, s.name as status_name, s.color as status_color,
                  exists (select 1 from artifact_link l join link_type ty on ty.id = l.link_type_id join artifact b on b.id = l.from_artifact_id
                          join status bs on bs.id = b.status_id where l.to_artifact_id = a.id and ty.key = 'blocks' and bs.category <> 'done') as blocked
           from artifact a join tracker t on t.id = a.tracker_id join status s on s.id = a.status_id join project p on p.id = a.project_id
           where p.key = $1 and t.key = any($2) order by a.created_at, a.id`,
          [projectKey, board.tracker_keys],
        )
      ).rows;
      // Champs des rôles affichés sur la carte, par tracker : clé, libellé et rôles de lecture.
      type RoleField = { key: string; label: string; readRoles: string[] | null };
      const roleFields = new Map<string, Record<string, RoleField>>();
      const trackerIds = [...new Set(rows.map((r) => r.tracker_id as string))];
      for (const f of (await c.query(
        `select tracker_id, semantic_role, key, label, read_roles from field_definition where tracker_id = any($1::uuid[]) and semantic_role = any($2)`,
        [trackerIds, ['title', 'assignee', 'priority', 'due_date']],
      )).rows) {
        const byRole = roleFields.get(f.tracker_id) ?? {};
        byRole[f.semantic_role as string] = { key: f.key, label: f.label, readRoles: f.read_roles ?? null };
        roleFields.set(f.tracker_id, byRole);
      }
      const initial = new Set((await c.query(
        `select s.key from status s join tracker t on t.id = s.tracker_id join project p on p.id = t.project_id where p.key = $1 and t.key = $2 and s.category = 'todo'`,
        [projectKey, board.tracker_keys[0]],
      )).rows.map((r) => r.key as string));
      const columns = (board.columns as ColumnSpec[]).map((spec) => ({
        name: spec.name, wipLimit: spec.wipLimit ?? null, count: 0, overLimit: false, creatable: spec.statuses.some((s) => initial.has(s)), cards: [] as Card[],
      }));
      const canRead = (restricted: string[] | null): boolean => !restricted || roles === undefined || roles.includes('athena-admin') || restricted.some((x) => roles.includes(x));
      const read = (r: { tracker_id: string; values: Record<string, unknown> }, role: string): string | null => {
        const f = roleFields.get(r.tracker_id)?.[role];
        if (!f || !canRead(f.readRoles)) return null;
        const v = r.values[f.key];
        return v === undefined || v === null || v === '' ? null : Array.isArray(v) ? v.join(', ') : String(v);
      };
      const subjects = [...new Set(rows.map((r) => read(r, 'assignee')).filter((s): s is string => s !== null))];
      const names = new Map(subjects.length === 0 ? [] : (await c.query('select subject, display_name from user_account where subject = any($1::text[])', [subjects])).rows
        .map((u) => [u.subject as string, (u.display_name as string | null) ?? (u.subject as string)]));
      let unmapped = 0;
      for (const r of rows) {
        const index = (board.columns as ColumnSpec[]).findIndex((spec) => spec.statuses.includes(r.status));
        if (index < 0) { unmapped++; continue; }
        const titleField = roleFields.get(r.tracker_id)?.['title'];
        const assignee = read(r, 'assignee');
        const priority = read(r, 'priority');
        columns[index]!.cards.push({
          key: r.key, tracker: r.tracker, trackerName: r.tracker_name, status: r.status, statusName: r.status_name, statusColor: (r.status_color as string | null) ?? null, version: r.version,
          title: !titleField || canRead(titleField.readRoles) ? String(r.values[titleField?.key ?? 'title'] ?? r.key) : r.key,
          assignee, assigneeName: assignee ? names.get(assignee) ?? assignee : null,
          priority, priorityLabel: priority ? roleFields.get(r.tracker_id)?.['priority']?.label ?? null : null,
          due: read(r, 'due_date'), blocked: r.blocked === true,
        });
      }
      for (const column of columns) {
        column.count = column.cards.length;
        column.overLimit = column.wipLimit !== null && column.count > column.wipLimit;
      }
      return { key: boardKey, name: board.name, trackers: board.tracker_keys as string[], columns, unmapped };
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
           join status s on s.id = a.status_id join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)`,
          [projectKey, artifactKey],
        )
      ).rows[0];
      if (!artifact) throw notFound(`Ticket ${artifactKey}`);
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

  /**
   * Board d'un projet, ou board virtuel d'un tracker (clé `~TRACKER`) : une colonne par statut du tracker, dans l'ordre,
   * sans limite WIP. Le board d'un tracker n'est pas stocké ; il suit la configuration du tracker.
   */
  private async load(c: import('pg').PoolClient, projectKey: string, boardKey: string) {
    if (boardKey.startsWith('~')) {
      const trackerKey = boardKey.slice(1);
      const tracker = (await c.query('select t.id, t.name from tracker t join project p on p.id = t.project_id where p.key = $1 and t.key = $2', [projectKey, trackerKey])).rows[0];
      if (!tracker) throw notFound(`Tracker ${trackerKey}`);
      const statuses = (await c.query('select key, name from status where tracker_id = $1 order by position', [tracker.id])).rows;
      return { name: tracker.name as string, tracker_keys: [trackerKey], columns: statuses.map((s) => ({ name: s.name as string, statuses: [s.key as string] })) };
    }
    const row = (
      await c.query('select b.* from board b join project p on p.id = b.project_id where p.key = $1 and b.key = $2', [projectKey, boardKey])
    ).rows[0];
    if (!row) throw notFound(`Board ${boardKey}`);
    return row;
  }
}
