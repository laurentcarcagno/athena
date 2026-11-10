import { Body, Controller, Delete, Get, HttpCode, Inject, Put, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { DashboardService, LayoutInput } from './dashboard.service';
import { OrgResolver, parseBody } from './http';

/** Disposition du tableau de bord personnel : donnée personnelle, accessible à toute personne connectée (y compris l'assurance qualité). */
@Controller('v1/me')
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get('dashboard')
  async get(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.dashboard.get(organizationId, actor);
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Put('dashboard')
  @BodySchema(LayoutInput)
  async put(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.dashboard.put(organizationId, parseBody(LayoutInput, body), actor);
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @HttpCode(204)
  @Delete('dashboard')
  async reset(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.dashboard.reset(organizationId, actor);
  }
}
