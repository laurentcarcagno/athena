import { Db } from './db';
import { notFound } from './errors';

export interface TreeNode {
  key: string;
  title: string;
  status: string;
  statusName: string;
  category: string;
  /** Enfants directs (dans ce tracker), pour afficher le triangle de dépliage sans les charger. */
  childCount: number;
  /** L'item a un lien suspect, à l'une ou l'autre extrémité. */
  suspect: boolean;
}
export interface TreePage { items: TreeNode[]; total: number }

/**
 * Hiérarchie d'un tracker : les liens des types hiérarchiques vont de l'enfant vers le parent (« raffine » : l'exigence
 * détaillée raffine l'exigence mère). Seuls comptent les liens entre items du même tracker ; un item sans parent dans le
 * tracker est une racine. Les niveaux se chargent un à un ; un item à plusieurs parents apparaît sous chacun.
 */
export class TreeService {
  constructor(private readonly db: Db) {}

  async children(organizationId: string, projectKey: string, trackerKey: string, parentKey: string | null, roles: string[], limit = 200): Promise<TreePage> {
    return this.db.tx(organizationId, async (c) => {
      const tracker = (await c.query('select t.id from tracker t join project p on p.id = t.project_id where p.key = $1 and t.key = $2', [projectKey, trackerKey])).rows[0];
      if (!tracker) throw notFound(`Tracker ${projectKey}/${trackerKey}`);
      let parentId: string | null = null;
      if (parentKey !== null) {
        const row = (await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.tracker_id = $2 and a.id = resolve_artifact(p.id, $3)', [projectKey, tracker.id, parentKey])).rows[0];
        if (!row) throw notFound(`Ticket ${parentKey}`);
        parentId = row.id as string;
      }
      const titleField = (await c.query("select key, read_roles from field_definition where tracker_id = $1 and semantic_role = 'title'", [tracker.id])).rows[0];
      const readable = !titleField?.read_roles || roles.includes('athena-admin') || (titleField.read_roles as string[]).some((r) => roles.includes(r));
      const hasParent = `exists (select 1 from artifact_link l join link_type ty on ty.id = l.link_type_id join artifact par on par.id = l.to_artifact_id
                               where l.from_artifact_id = a.id and ty.hierarchical and par.tracker_id = a.tracker_id)`;
      const scope = parentId === null
        ? `not ${hasParent}`
        : `exists (select 1 from artifact_link l join link_type ty on ty.id = l.link_type_id where l.from_artifact_id = a.id and l.to_artifact_id = $2 and ty.hierarchical)`;
      const args: unknown[] = [tracker.id, ...(parentId === null ? [] : [parentId])];
      const total = Number((await c.query(`select count(*) n from artifact a where a.tracker_id = $1 and ${scope}`, args)).rows[0].n);
      const rows = (await c.query(
        `select a.key, a."values" as values, s.key as status, s.name as status_name, s.category,
                (select count(distinct kid.from_artifact_id) from artifact_link kid join link_type kt on kt.id = kid.link_type_id join artifact ka on ka.id = kid.from_artifact_id
                  where kid.to_artifact_id = a.id and kt.hierarchical and ka.tracker_id = a.tracker_id)::int as child_count,
                exists (select 1 from artifact_link sl where sl.suspect and (sl.from_artifact_id = a.id or sl.to_artifact_id = a.id)) as suspect
         from artifact a join status s on s.id = a.status_id
         where a.tracker_id = $1 and ${scope} order by a.number limit ${Math.min(Math.max(limit, 1), 500)}`,
        args,
      )).rows;
      return {
        total,
        items: rows.map((r): TreeNode => ({
          key: r.key as string,
          title: readable ? String((r.values as Record<string, unknown>)[titleField?.key ?? 'title'] ?? r.key) : (r.key as string),
          status: r.status as string, statusName: r.status_name as string, category: r.category as string,
          childCount: r.child_count as number, suspect: r.suspect as boolean,
        })),
      };
    });
  }
}
