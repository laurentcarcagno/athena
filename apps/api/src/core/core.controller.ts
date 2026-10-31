import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import type { Principal } from '../auth/token-verifier';
import { ArtifactService } from './artifact.service';
import { SearchService } from '../atql/search.service';
import { Db } from './db';
import { LinkService } from './link.service';
import { KeySchema, OrgResolver, parseBody } from './http';
import { TrackerService } from './tracker.service';

const ProjectBody = z.object({ key: KeySchema, name: z.string().min(1).max(200) });

const TrackerBody = z.object({
  key: KeySchema,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  fields: z.array(z.object({
    key: z.string(), label: z.string().min(1), type: z.string(),
    config: z.record(z.unknown()).optional(), required: z.boolean().optional(),
    semanticRole: z.enum(['title', 'description', 'status', 'assignee', 'due_date', 'estimate']).optional(),
  })).max(100),
  statuses: z.array(z.object({
    key: z.string(), name: z.string().min(1), category: z.enum(['todo', 'in_progress', 'done']),
  })).min(1).max(50),
  transitions: z.array(z.object({
    name: z.string().min(1), from: z.string().nullable(), to: z.string(),
    conditions: z.array(z.unknown()).optional(), validators: z.array(z.unknown()).optional(),
    postActions: z.array(z.unknown()).optional(),
  })).max(200),
});

const CreateArtifactBody = z.object({ values: z.record(z.unknown()) });
const UpdateArtifactBody = z.object({ values: z.record(z.unknown()), version: z.number().int().min(1) });
const TransitionBody = z.object({ name: z.string().min(1), version: z.number().int().min(1) });

const LinkTypeBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  outwardLabel: z.string().min(1).max(100),
  inwardLabel: z.string().min(1).max(100),
  hierarchical: z.boolean().optional(),
});
const LinkBody = z.object({ to: z.string().min(1), type: z.string().min(1) });
const RestoreBody = z.object({ version: z.number().int().min(1), expectedVersion: z.number().int().min(1) });
const CommentBody = z.object({ body: z.string().min(1).max(100_000) });

const principalOf =(request: AuthedRequest): Principal => request.principal!;

@Controller('v1/projects')
export class CoreController {
  constructor(
    private readonly orgs: OrgResolver,
    private readonly db: Db,
    private readonly trackers: TrackerService,
    private readonly artifacts: ArtifactService,
    private readonly links: LinkService,
    private readonly searcher: SearchService,
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
          `select t.key, t.name, t.description,
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
    const { organizationId } = await this.orgs.resolve(principalOf(request));
    return this.db.tx(organizationId, async (c) =>
      (
        await c.query(
          `select r.version, r.diff, r.git_sha as "gitSha", r.created_at as "at",
                  coalesce(u.display_name, r.actor) as actor
           from artifact_revision r join artifact a on a.id = r.artifact_id join project p on p.id = a.project_id
           left join user_account u on u.subject = r.actor
           where p.key = $1 and a.key = $2 order by r.version desc`,
          [project, key],
        )
      ).rows,
    );
  }

  @Roles('athena-admin')
  @Post()
  async createProject(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(ProjectBody, body);
    await this.trackers.createProject(organizationId, input.key, input.name, actor);
    return { key: input.key, name: input.name };
  }

  @Roles('athena-admin')
  @Post(':project/trackers')
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
  @Post(':project/trackers/:tracker/fields')
  async addField(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(z.object({
      key: z.string(), label: z.string().min(1).max(100), type: z.string(), config: z.record(z.unknown()).optional(),
      required: z.boolean().optional(), semanticRole: z.enum(['title', 'description', 'status', 'assignee', 'due_date', 'estimate']).optional(),
    }), body);
    await this.trackers.addField(organizationId, project, tracker, stripUndefined(input), actor);
    return { added: input.key };
  }

  @Roles('athena-admin')
  @Post(':project/trackers/:tracker/statuses')
  async addStatus(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(z.object({ key: z.string(), name: z.string().min(1).max(100), category: z.enum(['todo', 'in_progress', 'done']) }), body);
    await this.trackers.addStatus(organizationId, project, tracker, input, actor);
    return { added: input.key };
  }

  @Roles('athena-admin')
  @Post(':project/trackers/:tracker/transitions')
  async addTransition(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(z.object({
      name: z.string().min(1).max(100), from: z.string().nullable(), to: z.string(),
      conditions: z.array(z.unknown()).optional(), validators: z.array(z.unknown()).optional(), postActions: z.array(z.unknown()).optional(),
    }), body);
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
  async createArtifact(
    @Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown,
  ) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    return this.artifacts.create(organizationId, project, tracker, parseBody(CreateArtifactBody, body).values, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Get(':project/artifacts/:key')
  async getArtifact(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    const { organizationId } = await this.orgs.resolve(principalOf(request));
    return this.artifacts.get(organizationId, project, key);
  }

  @Roles('athena-user', 'athena-admin')
  @Patch(':project/artifacts/:key')
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
    return this.searcher.search(organizationId, project, q, actor.id, Number(limit), Number(offset));
  }

  @Roles('athena-admin')
  @Post(':project/link-types')
  async createLinkType(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    await this.links.createLinkType(organizationId, project, parseBody(LinkTypeBody, body), actor);
    return { created: true };
  }

  @Roles('athena-user', 'athena-admin')
  @Post(':project/artifacts/:key/links')
  async link(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(LinkBody, body);
    return { id: await this.links.link(organizationId, project, key, input.to, input.type, actor) };
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(200)
  @Post(':project/artifacts/:key/restore')
  async restore(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(principalOf(request));
    const input = parseBody(RestoreBody, body);
    return this.artifacts.restore(organizationId, project, key, input.version, input.expectedVersion, actor);
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
