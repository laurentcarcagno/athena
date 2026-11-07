import { Db } from '../core/db';
import { notFound, validation } from '../core/errors';
import { sanitizeDocText } from './sdoc-parser';

export interface DocumentSummary {
  id: string; source: string; path: string; title: string; nodes: number; requirements: number;
  sourceUrl: string | null; gitSha: string | null; indexedAt: string;
}
export interface TreeNode {
  /** Ancre stable : l'UID, ou nul pour une section ou un texte sans UID. */
  uid: string | null;
  type: string; title: string; statement: string; status: string;
  depth: number; parentUid: string | null; position: number;
  /** Artefacts d'Athena qui citent cette exigence (visibles du lecteur). */
  citations: number;
}
export interface SearchHit { uid: string; document: string; docId: string; type: string; title: string; snippet: string; match: 'uid' | 'prefix' | 'text' }
export interface NodeDetail extends TreeNode { source: string; docId: string; document: string; sourceUrl: string | null; parents: string[] }
export interface Citation { key: string; tracker: string; title: string; status: string; category: string; suspect: boolean; origin: 'athena' | 'document' }

const MAX_TREE_NODES = 20_000;
const MAX_HITS = 50;

/**
 * Consultation en lecture seule des documents StrictDoc indexés : liste, arborescence, recherche par UID (exact, préfixe) ou plein
 * texte, détail d'un nœud et artefacts qui le citent. Aucun point d'écriture. Les textes sont assainis avant renvoi (balises retirées,
 * le client les affiche comme du texte) ; les droits et les listes d'ayants droit sont ceux de la base (RLS).
 */
export class DocReadService {
  constructor(private readonly db: Db, private readonly gitlabUrl?: string) {}

  private sourceUrl(repoPath: string | null, ref: string | null, subPath: string | null, docPath?: string): string | null {
    if (!this.gitlabUrl || !repoPath) return null;
    const base = this.gitlabUrl.replace(/\/+$/, '');
    const file = docPath ? `/${docPath.replace(/^\/+/, '')}` : subPath ? `/${subPath}` : '';
    return `${base}/${repoPath.replace(/^\/+|\/+$/g, '')}/-/${docPath ? 'blob' : 'tree'}/${ref ?? 'main'}${file}`;
  }

  async documents(organizationId: string, projectKey: string): Promise<DocumentSummary[]> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const rows = (await c.query(
        `select s.name as source, d.doc_id, d.doc_path, max(d.document) as title, count(*)::int as nodes,
                count(*) filter (where d.node_type = 'REQUIREMENT')::int as requirements, s.repo_path, s.ref, s.sub_path, s.git_sha, s.indexed_at
         from doc_source s join doc_node d on d.source_id = s.id
         where s.project_id = $1 group by s.name, d.doc_id, d.doc_path, s.repo_path, s.ref, s.sub_path, s.git_sha, s.indexed_at order by s.name, d.doc_path`, [project.id])).rows;
      return rows.map((r) => ({
        id: r.doc_id as string, source: r.source as string, path: r.doc_path as string, title: sanitizeDocText((r.title as string) || (r.doc_path as string)), nodes: r.nodes as number, requirements: r.requirements as number,
        sourceUrl: this.sourceUrl(r.repo_path, r.ref, r.sub_path, r.doc_path), gitSha: (r.git_sha as string | null) ?? null, indexedAt: (r.indexed_at as Date).toISOString(),
      }));
    });
  }

  /** Document complet dans l'ordre de lecture, avec profondeur et nombre de citations par nœud. */
  async tree(organizationId: string, projectKey: string, docId: string): Promise<{ document: DocumentSummary; nodes: TreeNode[]; truncated: boolean }> {
    const summary = (await this.documents(organizationId, projectKey)).find((d) => d.id === docId);
    if (!summary) throw notFound(`Document ${docId}`);
    return this.db.tx(organizationId, async (c) => {
      const rows = (await c.query(
        `select d.uid, d.node_type, d.title, d.statement, d.status, d.depth, d.parent_uid, d.position, d.synthetic,
                (select count(*) from doc_link l where l.source_id = d.source_id and l.uid = d.uid)::int as citations
         from doc_node d join doc_source s on s.id = d.source_id join project p on p.id = s.project_id
         where p.key = $1 and s.name = $2 and d.doc_id = $3 order by d.position limit $4`, [projectKey, summary.source, docId, MAX_TREE_NODES + 1])).rows;
      return {
        document: summary,
        truncated: rows.length > MAX_TREE_NODES,
        nodes: rows.slice(0, MAX_TREE_NODES).map((r) => ({
          uid: r.synthetic ? null : (r.uid as string), type: r.node_type as string, title: sanitizeDocText(r.title as string), statement: sanitizeDocText(r.statement as string), status: sanitizeDocText(r.status as string),
          depth: r.depth as number, parentUid: r.parent_uid ? (r.parent_uid as string) : null, position: r.position as number, citations: r.citations as number,
        })),
      };
    });
  }

  /** Recherche par UID exact, préfixe d'UID, puis plein texte (titre, énoncé) ; au plus 50 résultats, UID exact d'abord. */
  async search(organizationId: string, projectKey: string, query: string, docId?: string): Promise<SearchHit[]> {
    const q = query.trim();
    if (q.length === 0 || q.length > 200) throw validation(['requête vide ou trop longue (200 caractères au plus)']);
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const hits = new Map<string, SearchHit>();
      const add = (rows: Array<Record<string, unknown>>, match: SearchHit['match']) => {
        for (const r of rows) {
          const key = `${r.source}:${r.uid}`;
          if (hits.has(key) || hits.size >= MAX_HITS) continue;
          hits.set(key, { uid: r.uid as string, document: sanitizeDocText((r.document as string) || ''), docId: r.doc_id as string, type: r.node_type as string, title: sanitizeDocText(r.title as string), snippet: sanitizeDocText(String(r.statement ?? '')).replace(/\s+/g, ' ').slice(0, 200), match });
        }
      };
      const base = `from doc_node d join doc_source s on s.id = d.source_id where s.project_id = $1 and not d.synthetic and ($2::text is null or d.doc_id = $2)`;
      const cols = 'd.uid, d.doc_id, d.document, d.node_type, d.title, d.statement, s.name as source';
      const doc = docId ?? null;
      add((await c.query(`select ${cols} ${base} and lower(d.uid) = lower($3) limit 5`, [project.id, doc, q])).rows, 'uid');
      const like = q.replace(/[\\%_]/g, (m) => `\\${m}`);
      add((await c.query(`select ${cols} ${base} and d.uid ilike $3 || '%' order by d.uid limit ${MAX_HITS}`, [project.id, doc, like])).rows, 'prefix');
      if (q.length >= 2) {
        add((await c.query(`select ${cols} ${base} and d.search_tsv @@ websearch_to_tsquery('simple', $3) order by ts_rank(d.search_tsv, websearch_to_tsquery('simple', $3)) desc, d.uid limit ${MAX_HITS}`, [project.id, doc, q])).rows, 'text');
      }
      return [...hits.values()];
    });
  }

  private async nodeRow(c: import('pg').PoolClient, projectKey: string, uid: string, source?: string) {
    const row = (await c.query(
      `select d.uid, d.node_type, d.title, d.statement, d.status, d.depth, d.parent_uid, d.position, d.doc_id, d.document, d.doc_path, d.parents, s.name as source, s.repo_path, s.ref, s.sub_path,
              (select count(*) from doc_link l where l.source_id = d.source_id and l.uid = d.uid)::int as citations
       from doc_node d join doc_source s on s.id = d.source_id join project p on p.id = s.project_id
       where p.key = $1 and d.uid = $2 and not d.synthetic and ($3::text is null or s.name = $3) order by s.name limit 1`, [projectKey, uid, source ?? null])).rows[0];
    if (!row) throw notFound(`Nœud documentaire ${uid}`);
    return row;
  }

  async node(organizationId: string, projectKey: string, uid: string, source?: string): Promise<NodeDetail> {
    return this.db.tx(organizationId, async (c) => {
      const r = await this.nodeRow(c, projectKey, uid, source);
      return {
        uid: r.uid as string, type: r.node_type as string, title: sanitizeDocText(r.title as string), statement: sanitizeDocText(r.statement as string), status: sanitizeDocText(r.status as string),
        depth: r.depth as number, parentUid: r.parent_uid ? (r.parent_uid as string) : null, position: r.position as number, citations: r.citations as number,
        source: r.source as string, docId: r.doc_id as string, document: sanitizeDocText(r.document as string), sourceUrl: this.sourceUrl(r.repo_path, r.ref, r.sub_path, r.doc_path), parents: r.parents as string[],
      };
    });
  }

  /** Artefacts d'Athena qui citent l'exigence, avec leur état et le caractère suspect du lien ; seuls ceux que le lecteur peut lire (RLS). */
  async citations(organizationId: string, projectKey: string, uid: string, source?: string): Promise<Citation[]> {
    return this.db.tx(organizationId, async (c) => {
      const node = await this.nodeRow(c, projectKey, uid, source);
      const rows = (await c.query(
        `select a.key, t.key as tracker, coalesce(a."values"->>'title', a."values"->>'name', '') as title, st.name as status, st.category, l.suspect, l.origin
         from doc_link l join artifact a on a.id = l.artifact_id join tracker t on t.id = a.tracker_id join status st on st.id = a.status_id
         join doc_source ds on ds.id = l.source_id join project p on p.id = ds.project_id
         where p.key = $1 and ds.name = $2 and l.uid = $3 order by a.key`, [projectKey, node.source, uid])).rows;
      return rows.map((r) => ({ key: r.key, tracker: r.tracker, title: sanitizeDocText(r.title), status: r.status, category: r.category, suspect: r.suspect, origin: r.origin }));
    });
  }
}
