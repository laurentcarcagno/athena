import type { PoolClient } from 'pg';
import { Db, type Actor } from '../core/db';
import { notFound, validation } from '../core/errors';
import { audit, outbox } from '../core/tracker.service';
import { parseSdoc } from './sdoc-parser';

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
}

export interface Coverage {
  requirementsWithoutArtifact: string[];
  artifactsWithoutRequirement: string[];
  covered: number;
  total: number;
}

export class DocLinkService {
  constructor(private readonly db: Db) {}

  /**
   * Indexe les fichiers .sdoc d'une source (lecture seule). Remplace l'index, crée les liens déclarés dans
   * le champ ATHENA_REFS et marque suspects les liens dont l'exigence a changé ou disparu.
   */
  async index(
    organizationId: string, projectKey: string, sourceName: string,
    files: Array<{ path: string; content: string }>, gitSha: string | null, actor: Actor,
  ): Promise<IndexResult> {
    const nodes = new Map<string, ReturnType<typeof parseSdoc>[number]>();
    for (const file of files) {
      for (const node of parseSdoc(file.content)) {
        if (nodes.has(node.uid)) throw validation([`UID en double : ${node.uid} (${file.path})`]);
        nodes.set(node.uid, node);
      }
    }
    return this.db.tx(organizationId, async (c) => {
      const project = (await c.query('select id from project where key = $1', [projectKey])).rows[0];
      if (!project) throw notFound(`Projet ${projectKey}`);
      const source = (
        await c.query(
          `insert into doc_source (organization_id, project_id, name, git_sha) values ($1,$2,$3,$4)
           on conflict (project_id, name) do update set git_sha = excluded.git_sha, indexed_at = now() returning id`,
          [organizationId, project.id, sourceName, gitSha],
        )
      ).rows[0].id as string;

      await c.query('delete from doc_node where source_id = $1', [source]);
      for (const n of nodes.values()) {
        await c.query(
          `insert into doc_node (organization_id, source_id, uid, node_type, document, title, statement, status, parents, athena_refs, content_hash)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [organizationId, source, n.uid, n.type, n.document, n.title, n.statement, n.status, n.parents, n.athenaRefs, n.contentHash],
        );
      }

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

      // Liens suspects : contenu modifié ou nœud disparu depuis la liaison.
      const suspected = await c.query(
        `update doc_link l set suspect = true
         where l.source_id = $1 and not l.suspect
           and not exists (select 1 from doc_node d where d.source_id = l.source_id and d.uid = l.uid and d.content_hash = l.linked_hash)`,
        [source],
      );
      const count = suspected.rowCount ?? 0;
      if (count > 0) await outbox(c, organizationId, 'project', project.id, 'doc.links_suspected', { source: sourceName, count });
      await audit(c, organizationId, actor, 'doc.index', `doc_source:${sourceName}`, { nodes: nodes.size, gitSha });
      return { nodes: nodes.size, linksCreated: created, linksSuspected: count };
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
