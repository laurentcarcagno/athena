import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from './http';
import { NormativeSchema } from './normative-template';
import { TemplateService, TemplateTrackerSchema } from './template.service';
import { TemplateUpgradeService } from './template-upgrade.service';

const ParentSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/), version: z.string().regex(/^[0-9]+(\.[0-9]+)?$/).optional() });

const TemplateBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'clé en minuscules, chiffres et tirets, 2 à 40 caractères'),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  /** Les trackers du template peuvent être décrits en entier, repris d'un projet existant ou choisis parmi des templates de tracker (les trois sources se combinent). */
  trackers: z.array(TemplateTrackerSchema).max(30).optional(),
  fromProject: z.object({ project: z.string().min(1).max(10), trackers: z.array(z.string()).max(30).optional() }).optional(),
  /** Clés de templates de tracker (livrés ou de l'organisation) à inclure. */
  trackerTemplates: z.array(z.string().max(40)).max(30).optional(),
  normative: NormativeSchema.optional(),
  parent: ParentSchema.nullable().optional(),
});

const PublishBody = z.object({ version: z.string().regex(/^[0-9]+(\.[0-9]+)?$/).optional() });
const ImportBody = z.object({ yaml: z.string().min(1).max(2_000_000) });

const TemplateUpdateBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  trackers: z.array(TemplateTrackerSchema).max(30),
  normative: NormativeSchema.optional(),
  parent: ParentSchema.nullable().optional(),
});

const TrackerTemplateUpdateBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  tracker: TemplateTrackerSchema,
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
    await this.templates.create(organizationId, { key: input.key, name: input.name, ...(input.description ? { description: input.description } : {}), trackers, ...(input.normative ? { normative: input.normative } : {}), ...(input.parent ? { parent: input.parent } : {}) }, actor);
    return { key: input.key, trackers: trackers.map((t) => t.key) };
  }

  @Roles('athena-admin')
  @Put(':key')
  @BodySchema(TemplateUpdateBody)
  async update(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(TemplateUpdateBody, body);
    await this.templates.update(organizationId, key, { name: input.name, ...(input.description !== undefined ? { description: input.description } : {}), trackers: input.trackers, ...(input.normative ? { normative: input.normative } : {}), ...(input.parent !== undefined ? { parent: input.parent } : {}) }, actor);
    return { key, trackers: input.trackers.map((t) => t.key) };
  }

  @Roles('athena-admin')
  @Get(':key/versions')
  async versions(@Req() request: AuthedRequest, @Param('key') key: string) {
    return this.templates.versions((await this.orgs.resolve(request.principal!)).organizationId, key);
  }

  /** Publie le gabarit : fige une version immuable. */
  @Roles('athena-admin')
  @Post(':key/publish')
  @BodySchema(PublishBody)
  async publish(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const snapshot = await this.templates.publish(organizationId, key, parseBody(PublishBody, body ?? {}).version, actor);
    return { key, version: snapshot.version };
  }

  /** Gabarit résolu (héritage fusionné) tel qu'il serait publié maintenant. */
  @Roles('athena-admin')
  @Get(':key/resolved')
  async resolved(@Req() request: AuthedRequest, @Param('key') key: string) {
    return this.templates.resolve((await this.orgs.resolve(request.principal!)).organizationId, key);
  }

  @Roles('athena-admin')
  @Get(':key/export')
  async exportYaml(@Req() request: AuthedRequest, @Param('key') key: string) {
    return { key, yaml: await this.templates.exportYaml((await this.orgs.resolve(request.principal!)).organizationId, key) };
  }

  @Roles('athena-admin')
  @Post('import')
  @BodySchema(ImportBody)
  async importYaml(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.templates.importYaml(organizationId, parseBody(ImportBody, body).yaml, actor);
  }

  /** Supprime un template de l'organisation ; pour un template livré, rétablit sa version d'origine. */
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
  @Put(':key')
  @BodySchema(TrackerTemplateUpdateBody)
  async update(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(TrackerTemplateUpdateBody, body);
    await this.templates.updateTrackerTemplate(organizationId, key, { name: input.name, ...(input.description !== undefined ? { description: input.description } : {}), tracker: input.tracker }, actor);
    return { key, tracker: input.tracker.key };
  }

  /** Supprime un template de l'organisation ; pour un template livré, rétablit sa version d'origine. */
  @Roles('athena-admin')
  @HttpCode(204)
  @Delete(':key')
  async remove(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.templates.removeTrackerTemplate(organizationId, key, actor);
  }
}

const UpgradeBody = z.object({ version: z.string().regex(/^[0-9]+(\.[0-9]+)?$/).optional() });

/** Gabarit d'un projet : version, phase, dérive, aperçu et application d'une montée de version. */
@Controller('v1/projects')
export class ProjectTemplateController {
  constructor(
    @Inject(TemplateUpgradeService) private readonly upgrades: TemplateUpgradeService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin')
  @Get(':project/template')
  async status(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.upgrades.status((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  /** Rapport d'impact : ne modifie rien. */
  @Roles('athena-admin')
  @Post(':project/template/upgrade-preview')
  @HttpCode(200)
  @BodySchema(UpgradeBody)
  async preview(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    return this.upgrades.preview((await this.orgs.resolve(request.principal!)).organizationId, project, parseBody(UpgradeBody, body ?? {}).version);
  }

  @Roles('athena-admin')
  @Post(':project/template/upgrade')
  @HttpCode(200)
  @BodySchema(UpgradeBody)
  async upgrade(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.upgrades.apply(organizationId, project, parseBody(UpgradeBody, body ?? {}).version, actor);
  }
}
