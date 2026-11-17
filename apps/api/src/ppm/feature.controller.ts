import { Body, Controller, Get, Inject, Param, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { FeatureService } from './feature.service';

const FeatureBody = z.object({ enabled: z.boolean() });

/** Interrupteurs de fonctionnalité : lus par toute personne connectée (l'interface masque ce qui est inactif), réglés par l'administration. */
@Controller('v1')
export class FeatureController {
  constructor(@Inject(FeatureService) private readonly features: FeatureService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles('athena-team-member', 'athena-admin', 'athena-pmo', 'athena-pm', 'athena-qa', 'athena-manager', 'athena-director')
  @Get('features')
  async list(@Req() request: AuthedRequest) {
    return this.features.all((await this.orgs.resolve(request.principal!)).organizationId);
  }

  @Roles('athena-admin')
  @Put('admin/features/:key')
  @BodySchema(FeatureBody)
  async set(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.features.set(organizationId, key, parseBody(FeatureBody, body).enabled, actor);
  }
}
