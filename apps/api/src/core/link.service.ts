import type { PoolClient } from 'pg';
import { Db, type Actor } from './db';
import { conflict, notFound, validation } from './errors';
import { assertPairAllowed, orgLinkTypes, resolveLinkType } from './link-type.service';
import { resolveMentions } from '../notify/mention';
import { emit, follow } from '../notify/notify.service';
import { audit, outbox } from './tracker.service';

export interface LinkView {
  id: string;
  type: string;
  direction: 'outward' | 'inward';
  label: string;
  /** Clé de l'autre extrémité ; absente si elle est sous contrôle export et illisible pour le lecteur. */
  other: string | null;
  /** Vrai : lien vers un item sous contrôle export, sans clé, titre ni contenu. */
  restricted?: boolean;
  suspect: boolean;
  /** Type hiérarchique : le lien va de l'enfant vers le parent (lien sortant = parent du ticket). */
  hierarchical: boolean;
  /** Type de traçabilité : une modification de contenu rend le lien suspect (regroupement « Traçabilité » de la fiche). */
  propagatesSuspect: boolean;
}

export interface LinkTypeView {
  key: string;
  outwardLabel: string;
  inwardLabel: string;
  hierarchical: boolean;
  /** `project` : type propre au projet (il surcharge celui de l'organisation) ; `organization` : type de l'organisation ou livré. */
  scope: 'project' | 'organization';
}

export interface CommentView {
  id: string;
  author: string;
  authorName: string;
  body: string;
  createdAt: string;
  /** Identifiants mentionnés qui peuvent lire l'item (création seulement). */
  mentions?: string[];
}

export class LinkService {
  constructor(private readonly db: Db) {}

  async createLinkType(
    organizationId: string, projectKey: string,
    input: { key: string; outwardLabel: string; inwardLabel: string; hierarchical?: boolean }, actor: Actor,
  ): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      await c.query(
        `insert into link_type (organization_id, project_id, key, outward_label, inward_label, hierarchical)
         values ($1,$2,$3,$4,$5,$6)`,
        [organizationId, project, input.key, input.outwardLabel, input.inwardLabel, input.hierarchical ?? false],
      );
      await audit(c, organizationId, actor, 'link_type.create', `project:${projectKey}/${input.key}`);
    });
  }

  /** Crée un lien orienté entre deux artefacts du même projet (trackers éventuellement différents). */
  async link(
    organizationId: string, projectKey: string, fromKey: string, toKey: string, typeKey: string, actor: Actor,
  ): Promise<string> {
    return this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const fromRow = await this.artifactRow(c, project, fromKey);
      const toRow = await this.artifactRow(c, project, toKey);
      const from = fromRow.id;
      const to = toRow.id;
      const type = await resolveLinkType(c, organizationId, project, typeKey);
      if (!type) throw notFound(`Type de lien ${typeKey}`);
      if (from === to) throw validation(['un artefact ne peut pas être lié à lui-même']);
      await assertPairAllowed(c, type, typeKey, from, to);
      if (type.hierarchical && (await this.reaches(c, to, from, type.id))) {
        throw conflict('Ce lien créerait un cycle dans la hiérarchie.');
      }
      const id = (
        await c.query(
          `insert into artifact_link (organization_id, from_artifact_id, to_artifact_id, link_type_id)
           values ($1,$2,$3,$4) returning id`,
          [organizationId, from, to, type.id],
        )
      ).rows[0].id as string;
      await outbox(c, organizationId, 'artifact', from, 'link.created', { from: fromRow.key, to: toRow.key, type: typeKey, actor: actor.id });
      await audit(c, organizationId, actor, 'link.create', `artifact:${fromRow.key}`, { to: toRow.key, type: typeKey });
      return id;
    });
  }

  async list(organizationId: string, projectKey: string, key: string): Promise<LinkView[]> {
    return this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const id = await this.artifact(c, project, key);
      const rows = (
        await c.query(
          `select l.id, l.suspect, t.key as type, t.outward_label, t.inward_label, t.hierarchical, t.propagates_suspect,
                  (l.from_artifact_id = $1) as outward, o.key as other
           from artifact_link l join link_type t on t.id = l.link_type_id
           left join artifact o on o.id = case when l.from_artifact_id = $1 then l.to_artifact_id else l.from_artifact_id end
           where l.from_artifact_id = $1 or l.to_artifact_id = $1 order by l.created_at`,
          [id],
        )
      ).rows;
      return rows.map((r) => ({
        id: r.id, type: r.type, direction: r.outward ? 'outward' : 'inward',
        label: r.outward ? r.outward_label : r.inward_label, other: r.other ?? null, ...(r.other === null ? { restricted: true } : {}), suspect: r.suspect,
        hierarchical: r.hierarchical === true, propagatesSuspect: r.propagates_suspect === true,
      }));
    });
  }

  /** Types de liens utilisables dans le projet : les siens, puis ceux de l'organisation qu'ils ne surchargent pas. */
  async listTypes(organizationId: string, projectKey: string): Promise<LinkTypeView[]> {
    return this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const own = (await c.query('select key, outward_label, inward_label, hierarchical from link_type where project_id = $1', [project])).rows.map(
        (r): LinkTypeView => ({ key: r.key as string, outwardLabel: r.outward_label as string, inwardLabel: r.inward_label as string, hierarchical: r.hierarchical as boolean, scope: 'project' }),
      );
      const shared = (await orgLinkTypes(c)).filter((t) => !own.some((o) => o.key === t.key))
        .map((t): LinkTypeView => ({ key: t.key, outwardLabel: t.outwardLabel, inwardLabel: t.inwardLabel, hierarchical: t.hierarchical, scope: 'organization' }));
      return [...own, ...shared].sort((a, b) => a.key.localeCompare(b.key));
    });
  }

  /** Supprime un lien du projet (dans un sens comme dans l'autre : le lien est le même objet). */
  async remove(organizationId: string, projectKey: string, linkId: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const row = (
        await c.query(
          `select l.id, f.key as from_key, t.key as to_key, ty.key as type from artifact_link l
           join artifact f on f.id = l.from_artifact_id join artifact t on t.id = l.to_artifact_id join link_type ty on ty.id = l.link_type_id
           where l.id::text = $1 and f.project_id = $2`,
          [linkId, project],
        )
      ).rows[0];
      if (!row) throw notFound('Lien');
      await c.query('delete from artifact_link where id = $1', [row.id]);
      await outbox(c, organizationId, 'artifact', row.id as string, 'link.deleted', { from: row.from_key, to: row.to_key, type: row.type, actor: actor.id });
      await audit(c, organizationId, actor, 'link.delete', `artifact:${row.from_key}`, { to: row.to_key, type: row.type });
    });
  }

  /** Acquitte un lien suspect après vérification humaine. */
  async clearSuspect(organizationId: string, linkId: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query('update artifact_link set suspect = false where id = $1 and suspect', [linkId]);
      if (result.rowCount === 0) throw notFound('Lien suspect');
      await audit(c, organizationId, actor, 'link.clear_suspect', `link:${linkId}`);
    });
  }

  async addComment(organizationId: string, projectKey: string, key: string, body: string, actor: Actor): Promise<CommentView> {
    if (body.trim().length === 0 || body.length > 100_000) throw validation(['commentaire vide ou trop long']);
    return this.db.tx(organizationId, async (c) => {
      const project = await this.project(c, projectKey);
      const { id: artifact, key: canonical } = await this.artifactRow(c, project, key);
      const row = (
        await c.query('insert into comment (organization_id, artifact_id, author, body) values ($1,$2,$3,$4) returning id, created_at', [
          organizationId, artifact, actor.id, body,
        ])
      ).rows[0];
      await outbox(c, organizationId, 'artifact', artifact, 'comment.created', { key: canonical, actor: actor.id, commentId: row.id });
      await audit(c, organizationId, actor, 'comment.create', `artifact:${canonical}`);
      // Une mention remplace la notification de commentaire de la personne mentionnée (pas deux alertes pour un même message).
      const mentioned = await resolveMentions(c, artifact, body);
      const warned = mentioned.length ? await emit(c, organizationId, { event: 'mention', artifactId: artifact, actor: actor.id, payload: { commentId: row.id }, direct: mentioned.map((m) => m.subject), directOnly: true }) : [];
      await emit(c, organizationId, { event: 'comment', artifactId: artifact, actor: actor.id, payload: { commentId: row.id }, exclude: warned });
      await follow(c, organizationId, actor.id, artifact);
      return { id: row.id, author: actor.id, authorName: actor.id, body, createdAt: row.created_at.toISOString(), mentions: mentioned.filter((m) => m.subject !== actor.id).map((m) => m.username) };
    });
  }

  async comments(organizationId: string, projectKey: string, key: string): Promise<CommentView[]> {
    return this.db.tx(organizationId, async (c) => {
      const artifact = await this.artifact(c, await this.project(c, projectKey), key);
      const rows = (await c.query('select c.id, c.author, coalesce(u.display_name, c.author) as author_name, c.body, c.created_at from comment c left join user_account u on u.organization_id = c.organization_id and u.subject = c.author where c.artifact_id = $1 order by c.created_at, c.id', [artifact])).rows;
      return rows.map((r) => ({ id: r.id, author: r.author, authorName: r.author_name, body: r.body, createdAt: r.created_at.toISOString() }));
    });
  }

  private async project(c: PoolClient, key: string): Promise<string> {
    const row = (await c.query('select id from project where key = $1', [key])).rows[0];
    if (!row) throw notFound(`Projet ${key}`);
    return row.id as string;
  }

  /** Identifiant d'un artefact par clé canonique ou ancienne clé (alias) dans le projet. */
  private async artifact(c: PoolClient, project: string, key: string): Promise<string> {
    return (await this.artifactRow(c, project, key)).id;
  }

  private async artifactRow(c: PoolClient, project: string, key: string): Promise<{ id: string; key: string }> {
    const row = (await c.query('select id, key from artifact where id = resolve_artifact($1, $2)', [project, key])).rows[0];
    if (!row) throw notFound(`Artefact ${key}`);
    return { id: row.id as string, key: row.key as string };
  }

  /** Vrai si `start` atteint `target` en suivant des liens de ce type (détection de cycle). */
  private async reaches(c: PoolClient, start: string, target: string, typeId: string): Promise<boolean> {
    const row = (
      await c.query(
        `with recursive walk(id) as (
           select $1::uuid
           union select l.to_artifact_id from artifact_link l join walk w on l.from_artifact_id = w.id where l.link_type_id = $3
         ) select exists (select 1 from walk where id = $2::uuid) as found`,
        [start, target, typeId],
      )
    ).rows[0];
    return row.found as boolean;
  }
}
