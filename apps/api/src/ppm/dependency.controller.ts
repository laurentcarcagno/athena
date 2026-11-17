import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { DependencyInput, DependencyService, PropagateInput } from './dependency.service';
import { FeatureGuard, RequiresFeature } from './feature.service';

const READERS = ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director'] as const;

/** Dépendances entre projets (lot 22) : le PMO et l'administrateur les créent ; la propagation d'un retard est en lecture seule. Interrupteur `ppm.capacity`. */
@Controller('v1')
@UseGuards(FeatureGuard)
@RequiresFeature('ppm.capacity')
export class DependencyController {
  constructor(@Inject(DependencyService) private readonly deps: DependencyService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles(...READERS)
  @Get('portfolios/:key/dependencies')
  async graph(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.deps.graph(organizationId, key, actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Post('dependencies')
  @HttpCode(201)
  @BodySchema(DependencyInput)
  async add(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.deps.add(organizationId, parseBody(DependencyInput, body), actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Delete('dependencies/:id')
  @HttpCode(204)
  async remove(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.deps.remove(organizationId, id, actor);
  }

  /** « Si ce ticket glisse de N jours ouvrés, qui est touché ? » : calcul en lecture, rien n'est écrit. */
  @Roles(...READERS)
  @Post('dependencies/propagate')
  @HttpCode(200)
  @BodySchema(PropagateInput)
  async propagate(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.deps.propagate(organizationId, parseBody(PropagateInput, body), actor);
  }
}
