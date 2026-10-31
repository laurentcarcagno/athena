import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import type { Principal } from '../auth/token-verifier';
import { ArtifactService } from './artifact.service';
import { Db } from './db';
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

const principalOf = (request: AuthedRequest): Principal => request.principal!;

@Controller('v1/projects')
export class CoreController {
  constructor(
    private readonly orgs: OrgResolver,
    private readonly db: Db,
    private readonly trackers: TrackerService,
    private readonly artifacts: ArtifactService,
  ) {}

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
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
