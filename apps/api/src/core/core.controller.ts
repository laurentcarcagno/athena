import { LayoutSchema } from './layout';
import { SEMANTIC_ROLES } from './semantic-roles';
import { HueSchema } from './hues';
import { TemplateService } from './template.service';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import type { Principal } from '../auth/token-verifier';
import { BodySchema } from '../openapi/body-schema';
import { ArtifactService } from './artifact.service';
import { SearchService } from '../atql/search.service';
import { Db } from './db';
import { LinkService } from './link.service';
import { KeySchema, OrgResolver, parseBody } from './http';
import { TrackerService } from './tracker.service';

const SetTypeBody = z.object({ typeKey: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/).nullable() });
const ProjectBody = z.object({ key: KeySchema, name: z.string().min(1).max(200), template: z.string().max(40).optional(), templateVersion: z.string().regex(/^[0-9]+(\.[0-9]+)?$/).optional(), criticality: z.string().max(20).optional() });

const TrackerBody = z.object({
  layout: LayoutSchema.optional(),
  typeKey: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/).nullish(),
  key: KeySchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  fields: z.array(z.object({
    key: z.string(), label: z.string().min(1), type: z.string(),
    config: z.record(z.string(), z.unknown()).optional(), required: z.boolean().optional(), isContent: z.boolean().optional(),
    semanticRole: z.enum(SEMANTIC_ROLES).optional(),
  })).max(100),
  statuses: z.array(z.object({
    key: z.string(), name: z.string().min(1), category: z.enum(['todo', 'in_progress', 'done']), color: HueSchema.nullable().optional(),
  })).min(1).max(50),
  transitions: z.array(z.object({
    name: z.string().min(1), from: z.string().nullable(), to: z.string(),
    conditions: z.array(z.unknown()).optional(), validators: z.array(z.unknown()).optional(),
    postActions: z.array(z.unknown()).optional(),
  })).max(200),
});

const CreateArtifactBody = z.object({ values: z.record(z.string(), z.unknown()) });
const UpdateArtifactBody = z.object({ values: z.record(z.string(), z.unknown()), version: z.number().int().min(1) });
const TransitionBody = z.object({ name: z.string().min(1), version: z.number().int().min(1) });

const LinkTypeBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  outwardLabel: z.string().min(1).max(100),
  inwardLabel: z.string().min(1).max(100),
  hierarchical: z.boolean().optional(),
});
const LinkBody = z.object({ to: z.string().min(1), type: z.string().min(1), lagDays: z.number().int().min(-365).max(365).optional() });
const RestoreBody = z.object({ version: z.number().int().min(1), expectedVersion: z.number().int().min(1) });
const CommentBody = z.object({ body: z.string().min(1).max(100_000) });

const principalOf =(request: AuthedRequest): Principal => request.principal!;

const SetHistoryModeBody = z.object({ mode: z.enum(['direct', 'merge_request']) });
const SetLayoutBody = z.object({ layout: LayoutSchema.nullable() });
const UpdateFieldBody = z.object({
      label: z.string().min(1).max(100).optional(), required: z.boolean().optional(), isContent: z.boolean().optional(),
      readRoles: z.array(z.string().max(60)).min(1).max(20).nullable().optional(), writeRoles: z.array(z.string().max(60)).min(1).max(20).nullable().optional(),
    });
const AddFieldBody = z.object({
      key: z.string(), label: z.string().min(1).max(100), type: z.string(), config: z.record(z.string(), z.unknown()).optional(),
      readRoles: z.array(z.string().max(60)).min(1).max(20).optional(), writeRoles: z.array(z.string().max(60)).min(1).max(20).optional(),
      required: z.boolean().optional(), isContent: z.boolean().optional(), semanticRole: z.enum(SEMANTIC_ROLES).optional(),
    });
const AddStatusBody = z.object({ key: z.string(), name: z.string().min(1).max(100), category: z.enum(['todo', 'in_progress', 'done']), color: HueSchema.nullable().optional() });
/** Modification d'un statut (T-0138) : nom, catégorie, teinte nommée (null = teinte de la catégorie). */
const PatchStatusBody = z.object({ name: z.string().min(1).max(100).optional(), category: z.enum(['todo', 'in_progress', 'done']).optional(), color: HueSchema.nullable().optional() }).strict();
const AddTransitionBody = z.object({
      name: z.string().min(1).max(100), from: z.string().nullable(), to: z.string(),
      conditions: z.array(z.unknown()).optional(), validators: z.array(z.unknown()).optional(), postActions: z.array(z.unknown()).optional(),
    });
@Controller('v1/projects')
export class CoreController {
  constructor(
    private readonly orgs: OrgResolver,
    private readonly db: Db,
    private readonly trackers: TrackerService,
    private readonly artifacts: ArtifactService,
    private readonly links: LinkService,
    private readonly searcher: SearchService,
    private readonly templates: TemplateService,
  ) {}

  @Roles('athena-user', 'athena-admin')
  @Get()
  async listProjects(@Req() request: AuthedRequest) {
    const { organizationId } = await this.orgs.resolve(principalOf(request));
    return this.db.tx(organizationId, async (c) =>
      (await c.query('select key, name from project order by key')).rows,
    );
  }

  @Roles('athena-user', 'athena-admin')
  @Get(':project/trackers')
  async listTrackers(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId } = await this.orgs.resolve(principalOf(request));
    return this.db.tx(organizationId, async (c) =>
      (
        await c.query(
          `select t.key, t.name, t.description, t.type_key as "typeKey",
                  (select count(*)::int from artifact a where a.tracker_id = t.id) as artifacts
           from tracker t join project p on p.id = t.project_id where p.key = $1 order by t.key`,
          [project],
        )
      ).rows,
    );
  }

  /** Historique d'un artefact : révisions, auteur, différences et SHA du commit GitLab. */
  @Roles('athena-user', 'athena-admin')
  @Get(':project/artifacts/:key/history')
  async history(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const rows = await this.db.tx(organizationId, async (c) =>
      (
        await c.query(
          `select r.version, r.diff, r.git_sha as "gitSha", r.created_at as "at",
                  coalesce(u.display_name, r.actor) as actor
           from artifact_revision r join artifact a on a.id = r.artifact_id join project p on p.id = a.project_id
           left join user_account u on u.subject = r.actor
           where p.key = $1 and a.id = resolve_artifact(p.id, $2) order by r.version desc`,
          [project, key],
        )
      ).rows,
    );
    // Les champs à lecture restreinte n'apparaissent pas non plus dans les différences de l'historique.
    const hidden = await this.db.tx(organizationId, async (c) => {
      const tracker = (await c.query('select t.key from artifact a join tracker t on t.id = a.tracker_id join project p on p.id = a.project_id where p.key = $1 and a.id = resolve_artifact(p.id, $2)', [project, key])).rows[0]?.key as string | undefined;
      if (!tracker) return new Set<string>();
      const def = await this.trackers.getDefinition(c, project, tracker);
      return new Set(def.fields.filter((f) => f.readRoles && !actor.roles.includes('athena-admin') && !f.readRoles.some((r) => actor.roles.includes(r))).map((f) => f.key));
    });
    if (hidden.size === 0) return rows;
    return rows.map((r) => ({ ...r, diff: Object.fromEntries(Object.entries(r.diff as Record<string, unknown>).filter(([k]) => !hidden.has(k))) }));
  }

  @Roles('athena-admin')
  @Post()
  @BodySchema(ProjectBody)
  async createProject(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(ProjectBody, body);
    const created = await this.templates.createProject(organizationId, input.key, input.name, input.template, actor, { ...(input.templateVersion ? { version: input.templateVersion } : {}), ...(input.criticality ? { criticality: input.criticality } : {}) });
    return { key: input.key, name: input.name, trackers: created.trackers, templateVersion: created.templateVersion };
  }

  @Roles('athena-admin')
  @Post(':project/trackers')
  @BodySchema(TrackerBody)
  async createTracker(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(TrackerBody, body);
    const id = await this.trackers.createTracker(
      organizationId,
      { ...input, projectKey: project, fields: input.fields.map(stripUndefined), transitions: input.transitions },
      actor,
    );
    return { id, key: input.key };
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Patch(':project/trackers/:tracker/layout')
  @BodySchema(SetLayoutBody)
  async setLayout(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    await this.trackers.setLayout(organizationId, project, tracker, parseBody(SetLayoutBody, body).layout, actor);
  }

  /** Rattache le tracker à un type d'organisation, ou le détache (`typeKey: null`). */
  @Roles('athena-admin')
  @HttpCode(204)
  @Patch(':project/trackers/:tracker/type')
  @BodySchema(SetTypeBody)
  async setType(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    await this.trackers.setType(organizationId, project, tracker, parseBody(SetTypeBody, body).typeKey, actor);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Patch(':project/trackers/:tracker/history-mode')
  @BodySchema(SetHistoryModeBody)
  async setHistoryMode(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(SetHistoryModeBody, body);
    await this.trackers.setHistoryMode(organizationId, project, tracker, input.mode, actor);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Patch(':project/trackers/:tracker/fields/:field')
  @BodySchema(UpdateFieldBody)
  async updateField(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Param('field') field: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(UpdateFieldBody, body);
    await this.trackers.updateField(organizationId, project, tracker, field, stripUndefined(input), actor);
  }

  @Roles('athena-admin')
  @Get(':project/trackers/:tracker/fields/:field/impact')
  async fieldImpact(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Param('field') field: string) {
    const { organizationId } = await this.orgs.resolve(principalOf(request));
    return this.trackers.fieldImpact(organizationId, project, tracker, field);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete(':project/trackers/:tracker/fields/:field')
  async removeField(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Param('field') field: string, @Query('purge') purge?: string) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    await this.trackers.removeField(organizationId, project, tracker, field, purge === 'true', actor);
  }

  @Roles('athena-admin')
  @Post(':project/trackers/:tracker/fields')
  @BodySchema(AddFieldBody)
  async addField(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(AddFieldBody, body);
    await this.trackers.addField(organizationId, project, tracker, stripUndefined(input), actor);
    return { added: input.key };
  }

  @Roles('athena-admin')
  @Post(':project/trackers/:tracker/statuses')
  @BodySchema(AddStatusBody)
  async addStatus(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(AddStatusBody, body);
    await this.trackers.addStatus(organizationId, project, tracker, input, actor);
    return { added: input.key };
  }

  @Roles('athena-admin')
  @Patch(':project/trackers/:tracker/statuses/:status')
  @BodySchema(PatchStatusBody)
  async patchStatus(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Param('status') status: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(PatchStatusBody, body);
    await this.trackers.updateStatus(organizationId, project, tracker, status, stripUndefined(input), actor);
    return { updated: status };
  }

  @Roles('athena-admin')
  @Post(':project/trackers/:tracker/transitions')
  @BodySchema(AddTransitionBody)
  async addTransition(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(AddTransitionBody, body);
    await this.trackers.addTransition(organizationId, project, tracker, stripUndefined(input), actor);
    return { added: input.name };
  }

  @Roles('athena-user', 'athena-admin')
  @Get(':project/trackers/:tracker')
  async getTracker(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string) {
    const { organizationId } = await this.orgs.resolve(principalOf(request));
    return this.db.tx(organizationId, (c) => this.trackers.getDefinition(c, project, tracker));
  }

  @Roles('athena-user', 'athena-admin')
  @Post(':project/trackers/:tracker/artifacts')
  @BodySchema(CreateArtifactBody)
  async createArtifact(
    @Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown,
  ) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    return this.artifacts.create(organizationId, project, tracker, parseBody(CreateArtifactBody, body).values, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Get(':project/artifacts/:key')
  async getArtifact(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    return this.artifacts.get(organizationId, project, key, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Patch(':project/artifacts/:key')
  @BodySchema(UpdateArtifactBody)
  async updateArtifact(
    @Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown,
  ) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(UpdateArtifactBody, body);
    return this.artifacts.update(organizationId, project, key, input.values, input.version, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(200)
  @Post(':project/artifacts/:key/transitions')
  @BodySchema(TransitionBody)
  async transition(
    @Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown,
  ) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(TransitionBody, body);
    return this.artifacts.transition(organizationId, project, key, input.name, input.version, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Get(':project/search')
  async search(
    @Req() request: AuthedRequest, @Param('project') project: string,
    @Query('q') q = '', @Query('limit') limit = '50', @Query('offset') offset = '0',
  ) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    return this.searcher.search(organizationId, project, q, actor.id, Number(limit), Number(offset), actor.roles);
  }

  @Roles('athena-admin')
  @Post(':project/link-types')
  @BodySchema(LinkTypeBody)
  async createLinkType(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    await this.links.createLinkType(organizationId, project, parseBody(LinkTypeBody, body), actor);
    return { created: true };
  }

  @Roles('athena-user', 'athena-admin')
  @Post(':project/artifacts/:key/links')
  @BodySchema(LinkBody)
  async link(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(LinkBody, body);
    return { id: await this.links.link(organizationId, project, key, input.to, input.type, actor, input.lagDays ?? 0) };
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(200)
  @Post(':project/artifacts/:key/restore')
  @BodySchema(RestoreBody)
  async restore(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(RestoreBody, body);
    return this.artifacts.restore(organizationId, project, key, input.version, input.expectedVersion, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Get(':project/link-types')
  async listLinkTypes(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId } = await this.orgs.resolve(principalOf(request));
    return this.links.listTypes(organizationId, project);
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(204)
  @Delete(':project/links/:id')
  async removeLink(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    await this.links.remove(organizationId, project, id, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Get(':project/artifacts/:key/links')
  async listLinks(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    const { organizationId } = await this.orgs.resolve(principalOf(request));
    return this.links.list(organizationId, project, key);
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(204)
  @Post(':project/links/:id/clear-suspect')
  async clearSuspect(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    await this.links.clearSuspect(organizationId, id, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Post(':project/artifacts/:key/comments')
  @BodySchema(CommentBody)
  async addComment(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    return this.links.addComment(organizationId, project, key, parseBody(CommentBody, body).body, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Get(':project/artifacts/:key/comments')
  async comments(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    const { organizationId } = await this.orgs.resolve(principalOf(request));
    return this.links.comments(organizationId, project, key);
  }
}

// Routes de liens et commentaires : voir CoreController ci-dessus (méthodes ajoutées par T-0008).
function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
