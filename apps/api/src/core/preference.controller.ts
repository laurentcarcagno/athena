import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from './http';
import { PreferenceInput, PreferenceService } from './preference.service';

/** Préférences personnelles (accueil, langue, thème) : donnée du compte, accessible à toute personne connectée. */
@Controller('v1/me')
export class PreferenceController {
  constructor(
    @Inject(PreferenceService) private readonly preferences: PreferenceService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get('preferences')
  async get(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.preferences.get(organizationId, actor);
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Put('preferences')
  @BodySchema(PreferenceInput)
  async put(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.preferences.put(organizationId, parseBody(PreferenceInput, body), actor);
  }
}
