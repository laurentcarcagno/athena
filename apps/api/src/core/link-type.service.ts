import type { PoolClient } from 'pg';
import { z } from 'zod';
import { Db, type Actor } from './db';
import { conflict, notFound, validation } from './errors';
import { builtinLinkTypes, type BuiltinLinkType, type LinkPair } from './link-types';
import { audit } from './tracker.service';
import { TYPE_KEY, typeExists } from './tracker-types';

export const LinkTypeInput = z.object({
  outwardLabel: z.string().trim().min(1).max(100),
  inwardLabel: z.string().trim().min(1).max(100),
  hierarchical: z.boolean().default(false),
  propagatesSuspect: z.boolean().default(true),
  pairs: z.array(z.object({ from: z.string().regex(TYPE_KEY), to: z.string().regex(TYPE_KEY) })).max(100).default([]),
});
export type LinkTypeInput = z.infer<typeof LinkTypeInput>;

export interface OrgLinkTypeView { key: string; outwardLabel: string; inwardLabel: string; hierarchical: boolean; propagatesSuspect: boolean; pairs: LinkPair[]; builtin: boolean; modified: boolean }
export interface ResolvedLinkType { id: string; hierarchical: boolean; scope: 'project' | 'organization' }

const sameInput = (a: BuiltinLinkType, b: { outwardLabel: string; inwardLabel: string; hierarchical: boolean; propagatesSuspect: boolean; pairs: LinkPair[] }): boolean => {
  const norm = (p: LinkPair[]) => p.map((x) => `${x.from}>${x.to}`).sort().join(',');
  return a.outwardLabel === b.outwardLabel && a.inwardLabel === b.inwardLabel && a.hierarchical === b.hierarchical && a.propagatesSuspect === b.propagatesSuspect && norm(a.pairs) === norm(b.pairs);
};

async function insertPairs(c: PoolClient, org: string, typeId: string, pairs: LinkPair[]): Promise<void> {
  for (const p of pairs) await c.query('insert into link_type_pair (organization_id, link_type_id, from_tracker_type, to_tracker_type) values ($1,$2,$3,$4) on conflict do nothing', [org, typeId, p.from, p.to]);
}

/** Écrit un type livré en base (premier usage ou première modification) ; sans effet s'il y est déjà. */
async function materialize(c: PoolClient, org: string, b: BuiltinLinkType): Promise<string> {
  const inserted = (await c.query(
    `insert into link_type (organization_id, project_id, key, outward_label, inward_label, hierarchical, propagates_suspect) values ($1,null,$2,$3,$4,$5,$6)
     on conflict (organization_id, key) where project_id is null do nothing returning id`,
    [org, b.key, b.outwardLabel, b.inwardLabel, b.hierarchical, b.propagatesSuspect],
  )).rows[0];
  if (inserted) { await insertPairs(c, org, inserted.id as string, b.pairs); return inserted.id as string; }
  return (await c.query('select id from link_type where project_id is null and key = $1', [b.key])).rows[0].id as string;
}

/**
 * Type de lien d'une clé dans un projet : le type du projet d'abord (il surcharge), puis le type de l'organisation,
 * puis un type livré qui s'écrit alors en base. `null` si aucun.
 */
export async function resolveLinkType(c: PoolClient, org: string, projectId: string, key: string): Promise<ResolvedLinkType | null> {
  const own = (await c.query('select id, hierarchical from link_type where project_id = $1 and key = $2', [projectId, key])).rows[0];
  if (own) return { id: own.id as string, hierarchical: own.hierarchical as boolean, scope: 'project' };
  let shared = (await c.query('select id, hierarchical from link_type where project_id is null and key = $1', [key])).rows[0];
  if (!shared) {
    const builtin = builtinLinkTypes().find((b) => b.key === key);
    if (!builtin) return null;
    await materialize(c, org, builtin);
    shared = (await c.query('select id, hierarchical from link_type where project_id is null and key = $1', [key])).rows[0];
  }
  return { id: shared.id as string, hierarchical: shared.hierarchical as boolean, scope: 'organization' };
}

/** Un type d'organisation à paires ne relie que les types de tracker déclarés ; un tracker sans type n'est jamais contraint. */
export async function assertPairAllowed(c: PoolClient, type: ResolvedLinkType, typeKey: string, fromArtifact: string, toArtifact: string): Promise<void> {
  if (type.scope !== 'organization') return;
  const pairs = (await c.query('select from_tracker_type, to_tracker_type from link_type_pair where link_type_id = $1', [type.id])).rows;
  if (pairs.length === 0) return;
  const kinds = new Map((await c.query('select a.id, t.type_key from artifact a join tracker t on t.id = a.tracker_id where a.id = any($1)', [[fromArtifact, toArtifact]])).rows.map((r) => [r.id as string, r.type_key as string | null]));
  const from = kinds.get(fromArtifact);
  const to = kinds.get(toArtifact);
  if (!from || !to) return;
  if (pairs.some((p) => p.from_tracker_type === from && p.to_tracker_type === to)) return;
  const allowed = pairs.map((p) => `${p.from_tracker_type} → ${p.to_tracker_type}`).join(', ');
  throw validation([`le type de lien « ${typeKey} » ne relie pas ${from} à ${to} (paires autorisées : ${allowed})`]);
}

/** Types d'organisation : ceux de l'organisation, plus les types livrés non encore écrits. */
export async function orgLinkTypes(c: PoolClient): Promise<OrgLinkTypeView[]> {
  const rows = (await c.query('select id, key, outward_label, inward_label, hierarchical, propagates_suspect from link_type where project_id is null order by key')).rows;
  const pairRows = (await c.query('select link_type_id, from_tracker_type, to_tracker_type from link_type_pair order by from_tracker_type, to_tracker_type')).rows;
  const builtins = builtinLinkTypes();
  const stored = rows.map((r): OrgLinkTypeView => {
    const own = { outwardLabel: r.outward_label as string, inwardLabel: r.inward_label as string, hierarchical: r.hierarchical as boolean, propagatesSuspect: r.propagates_suspect as boolean,
      pairs: pairsOf(pairRows, r.id as string) };
    const builtin = builtins.find((b) => b.key === r.key);
    return { key: r.key as string, ...own, builtin: builtin !== undefined, modified: builtin !== undefined && !sameInput(builtin, own) };
  });
  const missing = builtins.filter((b) => !stored.some((s) => s.key === b.key)).map((b): OrgLinkTypeView => ({ key: b.key, outwardLabel: b.outwardLabel, inwardLabel: b.inwardLabel, hierarchical: b.hierarchical, propagatesSuspect: b.propagatesSuspect, pairs: b.pairs, builtin: true, modified: false }));
  return [...stored, ...missing].sort((a, b) => a.key.localeCompare(b.key));
}
const pairsOf = (pairRows: Array<Record<string, unknown>>, id: string): LinkPair[] =>
  pairRows.filter((p) => p.link_type_id === id).map((p) => ({ from: p.from_tracker_type as string, to: p.to_tracker_type as string }));

/** Administration des types de liens de l'organisation (administrateurs). */
export class LinkTypeService {
  constructor(private readonly db: Db) {}

  async list(organizationId: string): Promise<OrgLinkTypeView[]> {
    return this.db.tx(organizationId, (c) => orgLinkTypes(c));
  }

  async create(organizationId: string, key: string, input: LinkTypeInput, actor: Actor): Promise<void> {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) throw validation(['clé de type de lien invalide']);
    await this.db.tx(organizationId, async (c) => {
      const exists = (await c.query('select 1 from link_type where project_id is null and key = $1', [key])).rowCount || builtinLinkTypes().some((b) => b.key === key);
      if (exists) throw conflict(`Le type de lien ${key} existe déjà.`);
      await this.checkPairs(c, input.pairs);
      const id = (await c.query('insert into link_type (organization_id, project_id, key, outward_label, inward_label, hierarchical, propagates_suspect) values ($1,null,$2,$3,$4,$5,$6) returning id', [organizationId, key, input.outwardLabel, input.inwardLabel, input.hierarchical, input.propagatesSuspect])).rows[0].id as string;
      await insertPairs(c, organizationId, id, input.pairs);
      await audit(c, organizationId, actor, 'link_type.create', `link_type:${key}`);
    });
  }

  /** Modifie un type ; pour un type livré, l'écrit d'abord en base. Les liens existants ne sont pas revérifiés. */
  async update(organizationId: string, key: string, input: LinkTypeInput, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      let row = (await c.query('select id, hierarchical from link_type where project_id is null and key = $1', [key])).rows[0];
      if (!row) {
        const builtin = builtinLinkTypes().find((b) => b.key === key);
        if (!builtin) throw notFound(`Type de lien ${key}`);
        await materialize(c, organizationId, builtin);
        row = (await c.query('select id, hierarchical from link_type where project_id is null and key = $1', [key])).rows[0];
      }
      await this.checkPairs(c, input.pairs);
      if (row.hierarchical !== input.hierarchical) {
        const used = Number((await c.query('select count(*) n from artifact_link where link_type_id = $1', [row.id])).rows[0].n);
        if (used > 0) throw conflict(`Le type ${key} porte ${used} lien(s) : on ne change pas son caractère hiérarchique.`);
      }
      await c.query('update link_type set outward_label = $2, inward_label = $3, hierarchical = $4, propagates_suspect = $5 where id = $1', [row.id, input.outwardLabel, input.inwardLabel, input.hierarchical, input.propagatesSuspect]);
      await c.query('delete from link_type_pair where link_type_id = $1', [row.id]);
      await insertPairs(c, organizationId, row.id as string, input.pairs);
      await audit(c, organizationId, actor, 'link_type.update', `link_type:${key}`);
    });
  }

  /** Supprime un type de l'organisation (ou rétablit un type livré modifié) ; refusé s'il porte des liens. */
  async remove(organizationId: string, key: string, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const row = (await c.query('select id from link_type where project_id is null and key = $1', [key])).rows[0];
      const builtin = builtinLinkTypes().some((b) => b.key === key);
      if (!row && !builtin) throw notFound(`Type de lien ${key}`);
      if (!row) throw conflict(`Le type ${key} est livré avec Athena et n'a pas été modifié : rien à supprimer.`);
      const used = Number((await c.query('select count(*) n from artifact_link where link_type_id = $1', [row.id])).rows[0].n);
      if (used > 0) throw conflict(`Le type ${key} porte ${used} lien(s).`);
      await c.query('delete from link_type where id = $1', [row.id]);
      await audit(c, organizationId, actor, builtin ? 'link_type.reset' : 'link_type.delete', `link_type:${key}`);
    });
  }

  private async checkPairs(c: PoolClient, pairs: LinkPair[]): Promise<void> {
    const unknown: string[] = [];
    for (const key of new Set(pairs.flatMap((p) => [p.from, p.to]))) if (!(await typeExists(c, key))) unknown.push(key);
    if (unknown.length) throw validation([`types de tracker inconnus : ${unknown.join(', ')}`]);
  }
}
