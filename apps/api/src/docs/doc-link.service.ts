import type { PoolClient } from 'pg';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit, outbox } from '../core/tracker.service';
import { docIdOf, parseSdocTree } from './sdoc-parser';

export interface DocLinkView {
  artifact: string;
  uid: string;
  title: string;
  status: string;
  suspect: boolean;
  origin: 'athena' | 'document';
  orphan: boolean;
}

export interface IndexResult {
  nodes: number;
  linksCreated: number;
  linksSuspected: number;
  /** Ré-indexation incrémentale : nœuds réellement écrits (nouveaux ou modifiés) et nœuds supprimés ; les autres ne sont pas touchés. */
  written: number;
  removed: number;
}

/** Provenance des fichiers d'une source (dépôt, référence, sous-dossier), conservée pour pointer vers la source et détecter un index en retard. */
export interface SourceOrigin { repoPath: string; ref: string; subPath?: string | undefined }

export interface Coverage {
  requirementsWithoutArtifact: string[];
  artifactsWithoutRequirement: string[];
  covered: number;
  total: number;
}

export class DocLinkService {
  constructor(private readonly db: Db) {}

  /**
   * Indexe les fichiers .sdoc d'une source (lecture seule). Ré-indexation incrémentale : seuls les nœuds nouveaux ou modifiés sont
   * écrits, ceux qui ont disparu sont supprimés, les autres ne sont pas touchés. Crée les liens déclarés dans ATHENA_REFS et marque
   * suspects les liens dont l'exigence a changé ou disparu (événement `link.suspect` par lien, pour les webhooks).
   */
  async index(
    organizationId: string, projectKey: string, sourceName: string,
    files: Array<{ path: string; content: string }>, gitSha: string | null, actor: Actor, origin?: SourceOrigin,
  ): Promise<IndexResult> {
    type Entry = ReturnType<typeof parseSdocTree>[number] & { docId: string; docPath: string };
    const nodes = new Map<string, Entry>();
    const documents = new Set<string>();
    for (const file of files) {
      const docId = docIdOf(sourceName, file.path);
      if (documents.has(docId)) throw validation([`deux fichiers donnent le même identifiant de document : ${file.path}`]);
      documents.add(docId);
      for (const node of parseSdocTree(file.content, docId)) {
        if (nodes.has(node.uid)) throw validation([`UID en double : ${node.uid} (${file.path})`]);
        nodes.set(node.uid, { ...node, docId, docPath: file.path });
      }
    }
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const source = (
        await c.query(
          `insert into doc_source (organization_id, project_id, name, git_sha, repo_path, ref, sub_path) values ($1,$2,$3,$4,$5,$6,$7)
           on conflict (project_id, name) do update set git_sha = excluded.git_sha, indexed_at = now(),
             repo_path = coalesce(excluded.repo_path, doc_source.repo_path), ref = coalesce(excluded.ref, doc_source.ref), sub_path = coalesce(excluded.sub_path, doc_source.sub_path)
           returning id`,
          [organizationId, project.id, sourceName, gitSha, origin?.repoPath ?? null, origin?.ref ?? null, origin?.subPath ?? null],
        )
      ).rows[0].id as string;

      const existing = new Map(
        (await c.query('select uid, content_hash, doc_id, doc_path, position, parent_uid, depth, title, statement, status, node_type, document from doc_node where source_id = $1', [source])).rows
          .map((r) => [r.uid as string, r]),
      );
      let written = 0;
      for (const n of nodes.values()) {
        const old = existing.get(n.uid);
        const same = old && old.content_hash === n.contentHash && old.doc_id === n.docId && old.doc_path === n.docPath && old.position === n.position
          && (old.parent_uid ?? null) === n.parentUid && old.depth === n.depth && old.title === n.title && old.node_type === n.type && old.document === n.document;
        if (same) continue;
        await c.query(
          `insert into doc_node (organization_id, source_id, uid, node_type, document, title, statement, status, parents, athena_refs, content_hash, doc_id, doc_path, position, parent_uid, depth, synthetic)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           on conflict (source_id, uid) do update set node_type = excluded.node_type, document = excluded.document, title = excluded.title, statement = excluded.statement,
             status = excluded.status, parents = excluded.parents, athena_refs = excluded.athena_refs, content_hash = excluded.content_hash, doc_id = excluded.doc_id,
             doc_path = excluded.doc_path, position = excluded.position, parent_uid = excluded.parent_uid, depth = excluded.depth, synthetic = excluded.synthetic`,
          [organizationId, source, n.uid, n.type, n.document, n.title, n.statement, n.status, n.parents, n.athenaRefs, n.contentHash, n.docId, n.docPath, n.position, n.parentUid, n.depth, n.synthetic],
        );
        written += 1;
      }
      const gone = [...existing.keys()].filter((uid) => !nodes.has(uid));
      if (gone.length) await c.query('delete from doc_node where source_id = $1 and uid = any($2::text[])', [source, gone]);

      // Liens déclarés côté document (ATHENA_REFS) : créés si l'artefact existe.
      let created = 0;
      for (const n of nodes.values()) {
        for (const ref of n.athenaRefs) {
          const artifact = (await c.query('select resolve_artifact($1, $2) as id', [project.id, ref])).rows[0];
          if (!artifact?.id) continue;
          const inserted = await c.query(
            `insert into doc_link (organization_id, artifact_id, source_id, uid, linked_hash, origin)
             values ($1,$2,$3,$4,$5,'document') on conflict do nothing`,
            [organizationId, artifact.id, source, n.uid, n.contentHash],
          );
          created += inserted.rowCount ?? 0;
        }
      }

      // Liens suspects : contenu modifié ou nœud disparu depuis la liaison. Un événement `link.suspect` part pour chacun.
      const suspected = await c.query(
        `update doc_link l set suspect = true
         from artifact a
         where a.id = l.artifact_id and l.source_id = $1 and not l.suspect
           and not exists (select 1 from doc_node d where d.source_id = l.source_id and d.uid = l.uid and d.content_hash = l.linked_hash)
         returning l.artifact_id, a.key, l.uid`,
        [source],
      );
      const count = suspected.rowCount ?? 0;
      for (const l of suspected.rows) {
        await outbox(c, organizationId, 'artifact', l.artifact_id as string, 'link.suspect', { artifact: l.key, uid: l.uid, source: sourceName, kind: 'document', actor: actor.id });
      }
      if (count > 0) await outbox(c, organizationId, 'project', project.id, 'doc.links_suspected', { source: sourceName, count });
      await audit(c, organizationId, actor, 'doc.index', `doc_source:${sourceName}`, { nodes: nodes.size, written, removed: gone.length, gitSha });
      return { nodes: nodes.size, linksCreated: created, linksSuspected: count, written, removed: gone.length };
    });
  }

  async link(
    organizationId: string, projectKey: string, artifactKey: string, sourceName: string, uid: string, actor: Actor,
  ): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const { artifact, source } = await this.resolve(c, projectKey, artifactKey, sourceName);
      const node = (await c.query('select content_hash from doc_node where source_id = $1 and uid = $2', [source, uid])).rows[0];
      if (!node) throw notFound(`Nœud documentaire ${uid}`);
      await c.query(
        `insert into doc_link (organization_id, artifact_id, source_id, uid, linked_hash, origin) values ($1,$2,$3,$4,$5,'athena')`,
        [organizationId, artifact, source, uid, node.content_hash],
      );
      await outbox(c, organizationId, 'artifact', artifact, 'doc.link_created', { artifact: artifactKey, uid, source: sourceName, actor: actor.id });
      await audit(c, organizationId, actor, 'doc.link', `artifact:${artifactKey}`, { uid, source: sourceName });
    });
  }

  /** Acquitte un lien suspect : la version actuelle de l'exigence devient la référence. */
  async acknowledge(
    organizationId: string, projectKey: string, artifactKey: string, sourceName: string, uid: string, actor: Actor,
  ): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const { artifact, source } = await this.resolve(c, projectKey, artifactKey, sourceName);
      const node = (await c.query('select content_hash from doc_node where source_id = $1 and uid = $2', [source, uid])).rows[0];
      if (!node) throw notFound(`Nœud documentaire ${uid}`);
      const result = await c.query(
        'update doc_link set linked_hash = $4, suspect = false where artifact_id = $1 and source_id = $2 and uid = $3',
        [artifact, source, uid, node.content_hash],
      );
      if (result.rowCount === 0) throw notFound('Lien documentaire');
      await audit(c, organizationId, actor, 'doc.acknowledge', `artifact:${artifactKey}`, { uid });
    });
  }

  async links(organizationId: string, projectKey: string, artifactKey: string): Promise<DocLinkView[]> {
    return this.db.tx(organizationId, async (c) => {
      const rows = (
        await c.query(
          `select l.uid, l.suspect, l.origin, d.title, d.status, (d.uid is null) as orphan
           from doc_link l join artifact a on a.id = l.artifact_id join project p on p.id = a.project_id
           left join doc_node d on d.source_id = l.source_id and d.uid = l.uid
           where p.key = $1 and a.id = resolve_artifact(p.id, $2) order by l.created_at, l.uid`,
          [projectKey, artifactKey],
        )
      ).rows;
      return rows.map((r) => ({
        artifact: artifactKey, uid: r.uid, title: r.title ?? '', status: r.status ?? '', suspect: r.suspect, origin: r.origin, orphan: r.orphan,
      }));
    });
  }

  /** Exigences sans artefact, et artefacts du tracker donné sans exigence. */
  async coverage(organizationId: string, projectKey: string, sourceName: string, trackerKey: string): Promise<Coverage> {
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const source = (await c.query('select id from doc_source where project_id = $1 and name = $2', [project.id, sourceName])).rows[0];
      if (!source) throw notFound(`Source ${sourceName}`);
      const uncovered = (
        await c.query(
          `select d.uid from doc_node d where d.source_id = $1 and d.node_type = 'REQUIREMENT'
             and not exists (select 1 from doc_link l where l.source_id = d.source_id and l.uid = d.uid) order by d.uid`,
          [source.id],
        )
      ).rows.map((r) => r.uid as string);
      const orphans = (
        await c.query(
          `select a.key from artifact a join tracker t on t.id = a.tracker_id
           where a.project_id = $1 and t.key = $2 and not exists (select 1 from doc_link l where l.artifact_id = a.id) order by a.number`,
          [project.id, trackerKey],
        )
      ).rows.map((r) => r.key as string);
      const total = Number((await c.query("select count(*) n from doc_node where source_id = $1 and node_type = 'REQUIREMENT'", [source.id])).rows[0].n);
      return { requirementsWithoutArtifact: uncovered, artifactsWithoutRequirement: orphans, covered: total - uncovered.length, total };
    });
  }

  private async resolve(c: PoolClient, projectKey: string, artifactKey: string, sourceName: string) {
    const artifact = (
      await c.query('select a.id from artifact a join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [projectKey, artifactKey])
    ).rows[0];
    if (!artifact) throw notFound(`Artefact ${artifactKey}`);
    const source = (
      await c.query('select s.id from doc_source s join project p on p.id = s.project_id where p.key = $1 and s.name = $2', [projectKey, sourceName])
    ).rows[0];
    if (!source) throw notFound(`Source ${sourceName}`);
    return { artifact: artifact.id as string, source: source.id as string };
  }
}
