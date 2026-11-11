import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { AppearanceInput, AppearanceService } from './appearance.service';
import { OrgResolver, parseBody } from './http';

/** Apparence de l'organisation : lisible par toute personne connectée, modifiable par l'administration. */
@Controller('v1')
export class AppearanceController {
  constructor(
    @Inject(AppearanceService) private readonly appearance: AppearanceService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get('appearance')
  async get(@Req() request: AuthedRequest) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.appearance.get(organizationId);
  }

  @Roles('athena-admin')
  @Put('admin/appearance')
  @BodySchema(AppearanceInput)
  async put(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.appearance.put(organizationId, parseBody(AppearanceInput, body));
  }
}
