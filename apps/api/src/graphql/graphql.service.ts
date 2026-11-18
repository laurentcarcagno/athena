import { buildSchema, execute, GraphQLError, parse, specifiedRules, validate, type DocumentNode, type ValidationRule } from 'graphql';
import type { ArtifactService } from '../core/artifact.service';
import { Db, type Actor } from '../core/db';
import type { SearchService } from '../atql/search.service';

/**
 * GraphQL en **lecture seule** (plan § 3.1 : « GraphQL en lecture pour vues riches »). Le schéma n'a ni mutation ni abonnement : l'écriture reste dans l'API REST.
 * Toutes les lectures passent par les mêmes services que l'API REST (listes d'ayants droit, droits de lecture par champ) ; rien n'est lu directement hors de ces droits.
 */
export const SDL = /* GraphQL */ `
  "Valeur JSON (champs d'un ticket, dont la forme dépend du tracker)."
  scalar JSON

  type Query {
    projects: [Project!]!
    project(key: String!): Project
    "Ticket par clé (ex. ARI-BUG-0001)."
    artifact(project: String!, key: String!): Artifact
    "Recherche ATQL dans l'organisation ou dans des projets donnés (200 résultats au plus par page)."
    search(q: String!, projects: [String!], limit: Int = 50, offset: Int = 0): SearchPage!
  }

  type Project {
    key: String!
    name: String!
    trackers: [Tracker!]!
    "Tickets d'un tracker (clé du tracker en argument), via la recherche ATQL."
    artifacts(tracker: String, query: String, limit: Int = 50, offset: Int = 0): SearchPage!
  }

  type Tracker { key: String! name: String! description: String typeKey: String artifactCount: Int! }

  type Artifact { key: String! tracker: String! status: String! version: Int! values: JSON! }

  type SearchPage { total: Int! totalCapped: Boolean! hits: [Hit!]! }
  type Hit { key: String! project: String! tracker: String! title: String! status: String! statusName: String! }
`;

const MAX_QUERY_LENGTH = 20_000;
const MAX_DEPTH = 7;
const MAX_PAGE = 200;

/** Règle de validation : profondeur maximale d'une requête (protège contre les requêtes imbriquées coûteuses). */
export const depthLimit = (max: number): ValidationRule => (context) => {
  const depthOf = (selectionSet: { selections: readonly any[] } | undefined, fragments: Record<string, any>, seen: Set<string>): number => {
    if (!selectionSet) return 0;
    let deepest = 0;
    for (const s of selectionSet.selections) {
      if (s.kind === 'Field') { if (!String(s.name.value).startsWith('__')) deepest = Math.max(deepest, 1 + depthOf(s.selectionSet, fragments, seen)); }
      else if (s.kind === 'InlineFragment') deepest = Math.max(deepest, depthOf(s.selectionSet, fragments, seen));
      else if (s.kind === 'FragmentSpread') {
        if (seen.has(s.name.value)) continue; // les fragments récursifs sont refusés par les règles standard
        deepest = Math.max(deepest, depthOf(fragments[s.name.value]?.selectionSet, fragments, new Set([...seen, s.name.value])));
      }
    }
    return deepest;
  };
  const fragments: Record<string, any> = {};
  for (const d of context.getDocument().definitions) if (d.kind === 'FragmentDefinition') fragments[d.name.value] = d;
  return {
    OperationDefinition(node) {
      const depth = depthOf(node.selectionSet, fragments, new Set());
      if (depth > max) context.reportError(new GraphQLError(`Requête trop profonde : ${depth} niveaux (${max} au plus).`, { nodes: [node] }));
    },
  };
};

/** Message d'une erreur : celle d'un service (validation ATQL, droits) porte ses détails, qui sont conservés. */
const messageOf = (e: GraphQLError): string => {
  const original = e.originalError as { message?: string; details?: unknown } | undefined;
  const details = Array.isArray(original?.details) ? (original!.details as unknown[]).map(String).filter(Boolean) : [];
  return details.length > 0 ? `${e.message} ${details.join(' ; ')}` : e.message;
};

const clamp = (n: unknown, fallback: number, max: number) => Math.min(max, Math.max(0, Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : fallback));

export interface GraphqlContext { organizationId: string; actor: Actor }
export interface GraphqlRequest { query?: unknown; variables?: unknown; operationName?: unknown }

export class GraphqlService {
  private readonly schema = buildSchema(SDL);
  constructor(private readonly db: Db, private readonly artifacts: Pick<ArtifactService, 'get'>, private readonly searcher: Pick<SearchService, 'search' | 'searchOrganization'>) {}

  /** Racine : les champs sont des fonctions appelées par le résolveur par défaut de graphql-js (`(args, contexte)`). */
  private root() {
    const db = this.db;
    const searchPage = (r: { total: number; totalCapped: boolean; hits: Array<Record<string, unknown>> }) => ({ total: r.total, totalCapped: r.totalCapped, hits: r.hits });
    const project = (p: { key: string; name: string }) => ({
      key: p.key, name: p.name,
      trackers: (_a: unknown, ctx: GraphqlContext) => db.tx(ctx.organizationId, async (c) => (await c.query(
        `select t.key, t.name, t.description, t.type_key as "typeKey", (select count(*)::int from artifact a where a.tracker_id = t.id) as "artifactCount"
           from tracker t join project p on p.id = t.project_id where p.key = $1 order by t.key`, [p.key])).rows),
      artifacts: (a: { tracker?: string; query?: string; limit?: number; offset?: number }, ctx: GraphqlContext) => {
        const q = [`project = ${p.key}`, ...(a.tracker ? [`tracker = ${/^[A-Z][A-Z0-9]*$/.test(a.tracker) ? a.tracker : JSON.stringify(a.tracker)}`] : []), ...(a.query ? [`(${a.query})`] : [])].join(' AND ');
        return this.searcher.search(ctx.organizationId, p.key, q, ctx.actor.id, clamp(a.limit, 50, MAX_PAGE), clamp(a.offset, 0, 100_000), ctx.actor.roles).then(searchPage as never);
      },
    });
    return {
      projects: (_a: unknown, ctx: GraphqlContext) => db.tx(ctx.organizationId, async (c) => (await c.query('select key, name from project order by key')).rows).then((rows) => rows.map(project)),
      project: (a: { key: string }, ctx: GraphqlContext) => db.tx(ctx.organizationId, async (c) => (await c.query('select key, name from project where key = $1', [a.key])).rows[0]).then((p) => (p ? project(p) : null)),
      artifact: async (a: { project: string; key: string }, ctx: GraphqlContext) => {
        const x = await this.artifacts.get(ctx.organizationId, a.project, a.key, ctx.actor).catch((e: { code?: string }) => { if (e?.code === 'not_found') return null; throw e; });
        return x ? { key: x.key, tracker: x.trackerKey, status: x.status, version: x.version, values: x.values } : null;
      },
      search: (a: { q: string; projects?: string[]; limit?: number; offset?: number }, ctx: GraphqlContext) =>
        this.searcher.searchOrganization(ctx.organizationId, a.q, ctx.actor.id, { ...(a.projects?.length ? { projects: a.projects } : {}), limit: clamp(a.limit, 50, MAX_PAGE), offset: clamp(a.offset, 0, 100_000), roles: ctx.actor.roles }).then(searchPage as never),
    };
  }

  /** Exécute une requête. Mutations et abonnements sont refusés (le schéma n'en a pas). Réponse au format GraphQL : `{ data, errors }`. */
  async run(request: GraphqlRequest, ctx: GraphqlContext): Promise<{ data?: unknown; errors?: Array<{ message: string }> }> {
    const query = typeof request.query === 'string' ? request.query : '';
    if (!query.trim()) return { errors: [{ message: 'Requête absente.' }] };
    if (query.length > MAX_QUERY_LENGTH) return { errors: [{ message: `Requête trop longue (${MAX_QUERY_LENGTH} caractères au plus).` }] };
    let document: DocumentNode;
    try { document = parse(query); } catch (error) { return { errors: [{ message: (error as Error).message }] }; }
    if (document.definitions.some((d) => d.kind === 'OperationDefinition' && d.operation !== 'query')) return { errors: [{ message: 'Seules les requêtes (query) sont acceptées : GraphQL est en lecture seule.' }] };
    const problems = validate(this.schema, document, [...specifiedRules, depthLimit(MAX_DEPTH)]);
    if (problems.length > 0) return { errors: problems.map((e) => ({ message: e.message })) };
    const result = await execute({
      schema: this.schema, document, rootValue: this.root(), contextValue: ctx,
      variableValues: request.variables && typeof request.variables === 'object' ? (request.variables as Record<string, unknown>) : {},
      ...(typeof request.operationName === 'string' ? { operationName: request.operationName } : {}),
    });
    return { ...(result.data !== undefined ? { data: result.data } : {}), ...(result.errors ? { errors: result.errors.map((e) => ({ message: messageOf(e) })) } : {}) };
  }
}
