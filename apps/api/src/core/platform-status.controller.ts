import { Controller, Get, Inject, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver } from './http';
import { PlatformStatusService } from './platform-status.service';

/** État de la plateforme (historique, webhooks, plugins, jetons) : réservé à l'administrateur. */
@Controller('v1/admin')
export class PlatformStatusController {
  constructor(@Inject(PlatformStatusService) private readonly status: PlatformStatusService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles('athena-admin')
  @Get('platform-status')
  async get(@Req() request: AuthedRequest) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.status.status(organizationId);
  }
}
