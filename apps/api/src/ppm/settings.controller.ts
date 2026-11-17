import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { PpmSettingsInput, PpmSettingsService } from './settings.service';

/** Réglages PPM : lus par tout rôle connecté (la durée de la journée sert aux conversions), modifiés par l'administration. */
@Controller('v1')
export class PpmSettingsController {
  constructor(@Inject(PpmSettingsService) private readonly settings: PpmSettingsService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles('athena-team-member', 'athena-admin', 'athena-pmo', 'athena-pm', 'athena-qa', 'athena-manager', 'athena-director')
  @Get('ppm-settings')
  async get(@Req() request: AuthedRequest) {
    return this.settings.get((await this.orgs.resolve(request.principal!)).organizationId);
  }

  @Roles('athena-admin')
  @Put('admin/ppm-settings')
  @BodySchema(PpmSettingsInput)
  async put(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.settings.put(organizationId, parseBody(PpmSettingsInput, body), actor);
  }
}
