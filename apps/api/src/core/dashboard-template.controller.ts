import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { ASSIGNABLE_ROLES, TEMPLATE_TYPES, TemplateInput, TemplateKeySchema } from './dashboard-template';
import { DashboardTemplateService } from './dashboard-template.service';
import { OrgResolver, parseBody } from './http';

const TypeSchema = z.enum(TEMPLATE_TYPES);
const RoleSchema = z.enum(ASSIGNABLE_ROLES);
const DuplicateInput = z.object({ name: z.string().trim().min(1).max(100).optional() });
const HiddenInput = z.object({ hidden: z.boolean() });
const DefaultInput = z.object({ template: TemplateKeySchema });
const PreviewInput = z.object({
  project: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/).optional(), portfolio: z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/).optional(),
  projects: z.array(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/)).max(50).optional(), portfolios: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/)).max(50).optional(),
});

/** Administration des gabarits de tableaux de bord (Organisation › Gabarits) : réservée à l'administrateur (ADR-0010). */
@Controller('v1/dashboard-templates')
export class DashboardTemplateController {
  constructor(@Inject(DashboardTemplateService) private readonly templates: DashboardTemplateService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles('athena-admin')
  @Get()
  async list(@Req() request: AuthedRequest) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return { templates: await this.templates.all(organizationId), defaults: await this.templates.defaults(organizationId) };
  }

  /** Genres de cartes posables dans un gabarit de ce type pour ces rôles (`?type=home&roles=athena-pm,athena-qa`). */
  @Roles('athena-admin')
  @Get('catalog')
  async catalog(@Query('type') type?: string, @Query('roles') roles?: string) {
    const list = (roles ?? '').split(',').filter(Boolean).map((r) => parseBody(RoleSchema, r));
    return { kinds: this.templates.catalog(parseBody(TypeSchema, type), list) };
  }

  @Roles('athena-admin')
  @Get(':key')
  async one(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.templates.get(organizationId, parseBody(TemplateKeySchema, key));
  }

  @Roles('athena-admin')
  @Post()
  @BodySchema(TemplateInput)
  async create(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.templates.create(organizationId, parseBody(TemplateInput, body), actor);
  }

  @Roles('athena-admin')
  @Post(':key/duplicate')
  @BodySchema(DuplicateInput)
  async duplicate(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.templates.duplicate(organizationId, parseBody(TemplateKeySchema, key), actor, parseBody(DuplicateInput, body ?? {}).name);
  }

  @Roles('athena-admin')
  @Put(':key')
  @BodySchema(TemplateInput)
  async update(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.templates.update(organizationId, parseBody(TemplateKeySchema, key), parseBody(TemplateInput, body), actor);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete(':key')
  async remove(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.templates.remove(organizationId, parseBody(TemplateKeySchema, key), actor);
  }

  /** Masque ou réaffiche un gabarit livré. */
  @Roles('athena-admin')
  @Put(':key/hidden')
  @BodySchema(HiddenInput)
  async hidden(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const k = parseBody(TemplateKeySchema, key);
    await this.templates.setHidden(organizationId, k, parseBody(HiddenInput, body).hidden, actor);
    return this.templates.get(organizationId, k);
  }

  @Roles('athena-admin')
  @Put('defaults/:type/:role')
  @BodySchema(DefaultInput)
  async setDefault(@Req() request: AuthedRequest, @Param('type') type: string, @Param('role') role: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.templates.setDefault(organizationId, parseBody(TypeSchema, type), parseBody(RoleSchema, role), parseBody(DefaultInput, body).template, actor);
    return { defaults: await this.templates.defaults(organizationId) };
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete('defaults/:type/:role')
  async clearDefault(@Req() request: AuthedRequest, @Param('type') type: string, @Param('role') role: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.templates.clearDefault(organizationId, parseBody(TypeSchema, type), parseBody(RoleSchema, role), actor);
  }

  /** Aperçu « voir comme » : le gabarit résolu sur un projet ou un portefeuille réels, sans rien enregistrer. */
  @Roles('athena-admin')
  @Post(':key/preview')
  @BodySchema(PreviewInput)
  async preview(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.templates.preview(organizationId, actor, parseBody(TemplateKeySchema, key), parseBody(PreviewInput, body ?? {}));
  }
}
