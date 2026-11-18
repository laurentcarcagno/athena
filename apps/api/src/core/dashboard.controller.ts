import { z } from 'zod';
import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { DashboardService, LayoutInput, ScopeSchema, TabIdSchema, TabInput } from './dashboard.service';
import { DashboardTemplateService } from './dashboard-template.service';
import { TemplateKeySchema } from './dashboard-template';
import { ItemApprovalService } from './item-approval.service';
import { OrgResolver, parseBody } from './http';

/** `?project=ARI` : la Vue d'ensemble de ce projet ; avec `&page=avancement`, son Avancement ; sans paramètre, l'accueil personnel. */
const scopeOf = (project: string | undefined, page?: string, portfolio?: string): string => parseBody(ScopeSchema, portfolio ? `portfolio:${portfolio}` : project ? (page === 'avancement' ? `${project}:avancement` : project) : '');
/** `?tab=<id>` : un onglet nommé du classeur ; absent, l'onglet principal. */
const tabOf = (tab: string | undefined): string => (tab ? parseBody(TabIdSchema, tab) : '');
/** Dans l'adresse d'un onglet, « main » est l'onglet principal (identifiant vide). */
const tabParam = (id: string): string => (id === 'main' ? '' : parseBody(TabIdSchema, id));

const ApplyInput = z.object({ mode: z.enum(['add', 'replace']) });

const READERS = ['athena-team-member', 'athena-admin', 'athena-pm', 'athena-qa', 'athena-finance'] as const;
/** Le directeur est en lecture seule partout, sauf ici : sa disposition est une préférence personnelle, pas une donnée de projet. */
const WRITERS = [...READERS, 'athena-director'] as const;

/** Disposition du tableau de bord personnel : donnée personnelle, accessible à toute personne connectée (y compris l'assurance qualité). */
@Controller('v1/me')
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService,
    @Inject(ItemApprovalService) private readonly approvals: ItemApprovalService,
    @Inject(DashboardTemplateService) private readonly templates: DashboardTemplateService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles(...READERS)
  @Get('dashboard')
  async get(@Req() request: AuthedRequest, @Query('project') project?: string, @Query('page') page?: string, @Query('portfolio') portfolio?: string, @Query('tab') tab?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const scope = scopeOf(project, page, portfolio);
    if (!tab) await this.templates.applyDefault(organizationId, actor, scope);
    return this.dashboard.get(organizationId, actor, scope, tabOf(tab));
  }

  /** Genres de widget que mon rôle peut poser (T-0170). */
  @Roles(...READERS)
  @Get('dashboard/catalog')
  async catalog(@Req() request: AuthedRequest) {
    const { actor } = await this.orgs.resolve(request.principal!);
    return { kinds: this.dashboard.catalog(actor) };
  }

  /** Gabarits proposés à la personne pour ce tableau de bord (ses rôles, la nature du projet, son rôle dans le projet). */
  @Roles(...READERS)
  @Get('dashboard/templates')
  async proposed(@Req() request: AuthedRequest, @Query('project') project?: string, @Query('page') page?: string, @Query('portfolio') portfolio?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return { templates: await this.templates.proposed(organizationId, actor, scopeOf(project, page, portfolio)) };
  }

  /** Copie un gabarit dans mon tableau de bord : `add` ajoute ses onglets, `replace` remplace tout. */
  @Roles(...WRITERS)
  @Post('dashboard/templates/:key/apply')
  @BodySchema(ApplyInput)
  async apply(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown, @Query('project') project?: string, @Query('page') page?: string, @Query('portfolio') portfolio?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.templates.apply(organizationId, actor, scopeOf(project, page, portfolio), parseBody(TemplateKeySchema, key), parseBody(ApplyInput, body).mode);
  }

  /** Portefeuilles que mon rôle peut poser dans un tableau de bord, avec leurs projets (cartes de portefeuille, recherches et finances par portefeuille). */
  @Roles(...READERS)
  @Get('dashboard/portfolios')
  async portfolios(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return { portfolios: await this.templates.portfolios(organizationId, actor) };
  }

  /** Onglets du classeur d'une portée : l'onglet principal puis les onglets nommés. */
  @Roles(...READERS)
  @Get('dashboard/tabs')
  async tabs(@Req() request: AuthedRequest, @Query('project') project?: string, @Query('page') page?: string, @Query('portfolio') portfolio?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const scope = scopeOf(project, page, portfolio);
    await this.templates.applyDefault(organizationId, actor, scope);
    return { tabs: await this.dashboard.tabs(organizationId, actor, scope) };
  }

  @Roles(...WRITERS)
  @Post('dashboard/tabs')
  @BodySchema(TabInput)
  async createTab(@Req() request: AuthedRequest, @Body() body: unknown, @Query('project') project?: string, @Query('page') page?: string, @Query('portfolio') portfolio?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.dashboard.createTab(organizationId, actor, scopeOf(project, page, portfolio), parseBody(TabInput, body).title);
  }

  @Roles(...WRITERS)
  @Patch('dashboard/tabs/:id')
  @BodySchema(TabInput)
  async renameTab(@Req() request: AuthedRequest, @Param('id') id: string, @Body() body: unknown, @Query('project') project?: string, @Query('page') page?: string, @Query('portfolio') portfolio?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.dashboard.renameTab(organizationId, actor, scopeOf(project, page, portfolio), tabParam(id), parseBody(TabInput, body).title);
  }

  @Roles(...WRITERS)
  @HttpCode(204)
  @Delete('dashboard/tabs/:id')
  async deleteTab(@Req() request: AuthedRequest, @Param('id') id: string, @Query('project') project?: string, @Query('page') page?: string, @Query('portfolio') portfolio?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.dashboard.deleteTab(organizationId, actor, scopeOf(project, page, portfolio), tabParam(id));
  }

  /** Tickets qui attendent ma décision (widget « À approuver »). */
  @Roles(...READERS)
  @Get('approvals')
  async awaiting(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return { items: await this.approvals.awaiting(organizationId, { subject: actor.id, roles: request.principal!.roles }) };
  }

  @Roles(...WRITERS)
  @Put('dashboard')
  @BodySchema(LayoutInput)
  async put(@Req() request: AuthedRequest, @Body() body: unknown, @Query('project') project?: string, @Query('page') page?: string, @Query('portfolio') portfolio?: string, @Query('tab') tab?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.dashboard.put(organizationId, parseBody(LayoutInput, body), actor, scopeOf(project, page, portfolio), tabOf(tab));
  }

  @Roles(...WRITERS)
  @HttpCode(204)
  @Delete('dashboard')
  async reset(@Req() request: AuthedRequest, @Query('project') project?: string, @Query('page') page?: string, @Query('portfolio') portfolio?: string, @Query('tab') tab?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.dashboard.reset(organizationId, actor, scopeOf(project, page, portfolio), tabOf(tab));
  }
}
