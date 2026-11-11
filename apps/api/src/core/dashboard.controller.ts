import { Body, Controller, Delete, Get, HttpCode, Inject, Put, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { DashboardService, LayoutInput, ScopeSchema } from './dashboard.service';
import { ItemApprovalService } from './item-approval.service';
import { OrgResolver, parseBody } from './http';

/** `?project=ARI` : la Vue d'ensemble de ce projet ; avec `&page=avancement`, son Avancement ; sans paramètre, l'accueil personnel. */
const scopeOf = (project: string | undefined, page?: string): string => parseBody(ScopeSchema, project ? (page === 'avancement' ? `${project}:avancement` : project) : '');

/** Disposition du tableau de bord personnel : donnée personnelle, accessible à toute personne connectée (y compris l'assurance qualité). */
@Controller('v1/me')
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService,
    @Inject(ItemApprovalService) private readonly approvals: ItemApprovalService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get('dashboard')
  async get(@Req() request: AuthedRequest, @Query('project') project?: string, @Query('page') page?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.dashboard.get(organizationId, actor, scopeOf(project, page));
  }

  /** Tickets qui attendent ma décision (widget « À approuver »). */
  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get('approvals')
  async awaiting(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return { items: await this.approvals.awaiting(organizationId, { subject: actor.id, roles: request.principal!.roles }) };
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Put('dashboard')
  @BodySchema(LayoutInput)
  async put(@Req() request: AuthedRequest, @Body() body: unknown, @Query('project') project?: string, @Query('page') page?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.dashboard.put(organizationId, parseBody(LayoutInput, body), actor, scopeOf(project, page));
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @HttpCode(204)
  @Delete('dashboard')
  async reset(@Req() request: AuthedRequest, @Query('project') project?: string, @Query('page') page?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.dashboard.reset(organizationId, actor, scopeOf(project, page));
  }
}
