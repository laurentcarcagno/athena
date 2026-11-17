import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { validation } from '../core/errors';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { FeatureGuard, RequiresFeature } from './feature.service';
import { WorklogInput, WorklogService } from './worklog.service';

const READERS = ['athena-team-member', 'athena-admin', 'athena-pmo', 'athena-pm', 'athena-qa', 'athena-manager', 'athena-director'] as const;

/** Temps passé (lot 22) : saisi par ticket, par la personne qui a travaillé ; lu par ceux qui voient le ticket. Interrupteur `ppm.capacity`. */
@Controller('v1/projects/:p')
@UseGuards(FeatureGuard)
@RequiresFeature('ppm.capacity')
export class WorklogController {
  constructor(@Inject(WorklogService) private readonly worklog: WorklogService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles(...READERS)
  @Get('artifacts/:key/worklog')
  async forTicket(@Req() request: AuthedRequest, @Param('p') project: string, @Param('key') key: string) {
    return this.worklog.forTicket((await this.orgs.resolve(request.principal!)).organizationId, project, key);
  }

  @Roles('athena-team-member', 'athena-admin', 'athena-pm', 'athena-manager')
  @Post('artifacts/:key/worklog')
  @HttpCode(201)
  @BodySchema(WorklogInput)
  async add(@Req() request: AuthedRequest, @Param('p') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.worklog.add(organizationId, project, key, parseBody(WorklogInput, body), actor);
  }

  @Roles('athena-team-member', 'athena-admin', 'athena-pm', 'athena-manager')
  @Delete('worklog/:id')
  @HttpCode(204)
  async remove(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.worklog.remove(organizationId, id, actor);
  }

  /** Planifié (allocations) contre consommé (temps passé) du projet, par période. */
  @Roles(...READERS)
  @Get('planned-vs-consumed')
  async plannedVsConsumed(@Req() request: AuthedRequest, @Param('p') project: string, @Query('from') from = '', @Query('to') to = '', @Query('granularity') granularity?: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw validation(['from et to : dates AAAA-MM-JJ']);
    if (granularity !== undefined && granularity !== 'week' && granularity !== 'month') throw validation(['granularity : week ou month']);
    return this.worklog.plannedVsConsumed((await this.orgs.resolve(request.principal!)).organizationId, project, { from, to, ...(granularity ? { granularity } : {}) });
  }
}
