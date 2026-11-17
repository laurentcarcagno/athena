import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { MemberService } from '../core/member.service';
import { validation } from '../core/errors';
import { BodySchema } from '../openapi/body-schema';
import { AbsenceInput, AllocationInput, AvailabilityInput, CapacityDataService } from './capacity-data.service';
import { CapacityService } from './capacity.service';
import { FeatureGuard, RequiresFeature } from './feature.service';

const READERS = ['athena-team-member', 'athena-admin', 'athena-pmo', 'athena-pm', 'athena-qa', 'athena-manager', 'athena-director'] as const;

/** Capacité (lot 21) : vue par personne et par équipe, disponibilité, absences. Interrupteur `ppm.capacity` ; les droits fins sont dans les services. */
@Controller('v1/capacity')
@UseGuards(FeatureGuard)
@RequiresFeature('ppm.capacity')
export class CapacityController {
  constructor(
    @Inject(CapacityService) private readonly capacity: CapacityService, @Inject(CapacityDataService) private readonly data: CapacityDataService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  /** `?from=AAAA-MM-JJ&to=…&granularity=week|month&team=clé` : cartes de capacité des personnes et des équipes visibles du lecteur. */
  @Roles(...READERS)
  @Get()
  async view(@Req() request: AuthedRequest, @Query('from') from = '', @Query('to') to = '', @Query('granularity') granularity?: string, @Query('team') team?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    if (granularity !== undefined && granularity !== 'week' && granularity !== 'month') throw validation(['granularity : week ou month']);
    return this.capacity.view(organizationId, actor, { from, to, ...(granularity ? { granularity } : {}), ...(team ? { team } : {}) });
  }

  @Roles(...READERS)
  @Get('availability')
  async availability(@Req() request: AuthedRequest, @Query('subject') subject?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.data.listAvailability(organizationId, subject ?? actor.id, actor);
  }

  @Roles(...READERS)
  @Post('availability')
  @HttpCode(201)
  @BodySchema(AvailabilityInput)
  async addAvailability(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.data.addAvailability(organizationId, parseBody(AvailabilityInput, body), actor);
  }

  @Roles(...READERS)
  @Delete('availability/:id')
  @HttpCode(204)
  async removeAvailability(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.data.removeAvailability(organizationId, id, actor);
  }

  @Roles(...READERS)
  @Get('absences')
  async absences(@Req() request: AuthedRequest, @Query('subject') subject?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.data.listAbsences(organizationId, subject ?? actor.id, actor);
  }

  @Roles(...READERS)
  @Post('absences')
  @HttpCode(201)
  @BodySchema(AbsenceInput)
  async addAbsence(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.data.addAbsence(organizationId, parseBody(AbsenceInput, body), actor);
  }

  @Roles(...READERS)
  @Delete('absences/:id')
  @HttpCode(204)
  async removeAbsence(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.data.removeAbsence(organizationId, id, actor);
  }
}

/** Allocations d'un projet : lues par ceux qui voient le projet, saisies par son chef (ou l'administrateur). */
@Controller('v1/projects/:p/allocations')
@UseGuards(FeatureGuard)
@RequiresFeature('ppm.capacity')
export class AllocationController {
  constructor(@Inject(CapacityDataService) private readonly data: CapacityDataService, @Inject(MemberService) private readonly members: MemberService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles(...READERS)
  @Get()
  async list(@Req() request: AuthedRequest, @Param('p') project: string) {
    return this.data.listAllocations((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @Post()
  @HttpCode(201)
  @BodySchema(AllocationInput)
  async add(@Req() request: AuthedRequest, @Param('p') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    return this.data.addAllocation(organizationId, { ...parseBody(AllocationInput, body), project }, actor);
  }

  @Roles('athena-admin', 'athena-pm')
  @Delete(':id')
  @HttpCode(204)
  async remove(@Req() request: AuthedRequest, @Param('p') project: string, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    await this.data.removeAllocation(organizationId, project, id, actor);
  }
}
