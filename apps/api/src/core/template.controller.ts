import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from './http';
import { TemplateService, TemplateTrackerSchema } from './template.service';

const TemplateBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'clé en minuscules, chiffres et tirets, 2 à 40 caractères'),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  /** Les trackers du template peuvent être décrits en entier, repris d'un projet existant ou choisis parmi des templates de tracker (les trois sources se combinent). */
  trackers: z.array(TemplateTrackerSchema).max(30).optional(),
  fromProject: z.object({ project: z.string().min(1).max(10), trackers: z.array(z.string()).max(30).optional() }).optional(),
  /** Clés de templates de tracker (livrés ou de l'organisation) à inclure. */
  trackerTemplates: z.array(z.string().max(40)).max(30).optional(),
});

const TrackerTemplateBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'clé en minuscules, chiffres et tirets, 2 à 40 caractères'),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  tracker: TemplateTrackerSchema.optional(),
  fromTracker: z.object({ project: z.string().min(1).max(10), tracker: z.string().min(1).max(10) }).optional(),
}).refine((b) => (b.tracker === undefined) !== (b.fromTracker === undefined), { message: 'fournir tracker ou fromTracker, pas les deux' });

@Controller('v1/project-templates')
export class TemplateController {
  constructor(
    @Inject(TemplateService) private readonly templates: TemplateService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-admin')
  @Get()
  async list(@Req() request: AuthedRequest) {
    return this.templates.list((await this.orgs.resolve(request.principal!)).organizationId);
  }

  @Roles('athena-admin')
  @Post()
  @BodySchema(TemplateBody)
  async create(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(TemplateBody, body);
    const trackers = [
      ...(input.trackers ?? []),
      ...(input.fromProject ? await this.templates.trackersOf(organizationId, input.fromProject.project, input.fromProject.trackers) : []),
      ...(input.trackerTemplates?.length ? await this.templates.trackersFromTemplates(organizationId, input.trackerTemplates) : []),
    ];
    await this.templates.create(organizationId, { key: input.key, name: input.name, ...(input.description ? { description: input.description } : {}), trackers }, actor);
    return { key: input.key, trackers: trackers.map((t) => t.key) };
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete(':key')
  async remove(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.templates.remove(organizationId, key, actor);
  }
}

@Controller('v1/tracker-templates')
export class TrackerTemplateController {
  constructor(
    @Inject(TemplateService) private readonly templates: TemplateService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-admin')
  @Get()
  async list(@Req() request: AuthedRequest) {
    return this.templates.listTrackerTemplates((await this.orgs.resolve(request.principal!)).organizationId);
  }

  @Roles('athena-admin')
  @Post()
  @BodySchema(TrackerTemplateBody)
  async create(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(TrackerTemplateBody, body);
    const tracker = input.tracker ?? (await this.templates.trackersOf(organizationId, input.fromTracker!.project, [input.fromTracker!.tracker]))[0]!;
    await this.templates.createTrackerTemplate(organizationId, { key: input.key, name: input.name, ...(input.description ? { description: input.description } : {}), tracker }, actor);
    return { key: input.key, tracker: tracker.key };
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete(':key')
  async remove(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.templates.removeTrackerTemplate(organizationId, key, actor);
  }
}
