import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { MemberService } from '../core/member.service';
import { ScheduleService } from './schedule.service';

const LagBody = z.object({ lagDays: z.number().int().min(-365).max(365) }).strict();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Exactement un champ : le début déplace la tâche (durée conservée), la fin l'étire, la durée est en jours ouvrés. */
const TaskChangeBody = z.object({ start: Day.optional(), due: Day.optional(), duration: z.number().int().min(1).max(2000).optional() }).strict()
  .refine((b) => [b.start, b.due, b.duration].filter((x) => x !== undefined).length === 1, 'indiquer exactement un de : start, due, duration');

/** Planning d'un projet : lecture pour les membres, replanification pour l'administration et le chef du projet. */
@Controller('v1/projects/:project')
export class PlanningController {
  constructor(
    @Inject(ScheduleService) private readonly schedules: ScheduleService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
    @Inject(MemberService) private readonly members: MemberService,
  ) {}

  @Roles('athena-team-member', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get('schedule')
  async get(@Req() request: AuthedRequest, @Param('project') project: string, @Query('baseline') baseline?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.schedules.get(organizationId, project, actor.roles, baseline || undefined);
  }

  /** Baselines qui ont figé un planning (pour comparer le Gantt à l'une d'elles). */
  @Roles('athena-team-member', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get('schedule/baselines')
  async baselines(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.schedules.baselines(organizationId, project);
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

  /** Modifie une tâche puis replanifie ses successeurs (un seul commit d'historique). */
  @Roles('athena-admin', 'athena-pm')
  @Patch('schedule/tasks/:key')
  @BodySchema(TaskChangeBody)
  async editTask(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    return this.schedules.edit(organizationId, project, key, parseBody(TaskChangeBody, body), actor);
  }

  /** Change le décalage d'un lien « précède », puis replanifie les successeurs. */
  @Roles('athena-admin', 'athena-pm')
  @Patch('schedule/links/:id')
  @BodySchema(LagBody)
  async setLag(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    return this.schedules.setLag(organizationId, project, id, parseBody(LagBody, body).lagDays, actor);
  }
}
