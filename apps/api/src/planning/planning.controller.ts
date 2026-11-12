import { Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver } from '../core/http';
import { MemberService } from '../core/member.service';
import { ScheduleService } from './schedule.service';

/** Planning d'un projet : lecture pour les membres, replanification pour l'administration et le chef du projet. */
@Controller('v1/projects/:project')
export class PlanningController {
  constructor(
    @Inject(ScheduleService) private readonly schedules: ScheduleService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
    @Inject(MemberService) private readonly members: MemberService,
  ) {}

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get('schedule')
  async get(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.schedules.get(organizationId, project, actor.roles);
  }

  /** Écrit les dates calculées dans les tickets qui bougent (un seul commit d'historique). */
  @Roles('athena-admin', 'athena-pm')
  @HttpCode(200)
  @Post('schedule/apply')
  async apply(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    return this.schedules.apply(organizationId, project, actor);
  }
}
