import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { BodySchema } from '../openapi/body-schema';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { MemberService } from '../core/member.service';
import { BacklogService } from './backlog.service';
import { BoardService } from './board.service';
import { KpiService } from './kpi.service';
import { PipelineService } from '../gitcode/pipelines';
import { QualityService } from '../core/quality.service';
import { ReportService } from './report.service';
import { SprintService } from './sprint.service';

const BoardBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  name: z.string().min(1).max(200),
  trackerKeys: z.array(z.string()).min(1).max(20),
  columns: z.array(z.object({ name: z.string().min(1).max(100), statuses: z.array(z.string()).max(20), wipLimit: z.number().int().min(1).optional() })).min(1).max(12),
});
const MoveBody = z.object({ column: z.string().min(1), version: z.number().int().min(1) });
const SprintBody = z.object({
  name: z.string().min(1).max(200), goal: z.string().max(1000).optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const ItemBody = z.object({ artifact: z.string().min(1) });
const CloseBody = z.object({ moveTo: z.string().uuid().optional() });
const RankBody =z.object({ key: z.string().min(1).max(64), after: z.string().min(1).max(64).nullable() });

const CreateReleaseBody = z.object({ name: z.string().min(1).max(100), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
@Controller('v1/projects/:project')
export class AgileController {
  constructor(private readonly orgs: OrgResolver, private readonly boards: BoardService, private readonly sprints: SprintService, private readonly reports: ReportService, private readonly members: MemberService, private readonly backlogs: BacklogService, private readonly kpi: KpiService, private readonly pipelines: PipelineService, private readonly quality: QualityService) {}

  private ctx = (request: AuthedRequest) => this.orgs.resolve(request.principal!);
  /** Gestion de projet : administrateur, ou chef de ce projet. */
  private async manager(request: AuthedRequest, project: string) {
    const context = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(context.organizationId, project, context.actor);
    return context;
  }

  @Roles('athena-admin', 'athena-pm')
  @Post('boards')  @BodySchema(BoardBody)

  async createBoard(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.manager(request, project);
    const input = parseBody(BoardBody, body);
    await this.boards.create(organizationId, project, { ...input, columns: input.columns.map((c) => ({ ...c, ...(c.wipLimit === undefined ? { wipLimit: undefined } : {}) })) }, actor);
    return { key: input.key };
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('boards')
  async boardList(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.boards.list((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('boards/:board')
  async board(@Req() request: AuthedRequest, @Param('project') project: string, @Param('board') board: string) {
    const { organizationId, actor } = await this.ctx(request);
    return this.boards.view(organizationId, project, board, actor.roles);
  }

  @Roles('athena-team-member', 'athena-admin')
  @HttpCode(200)
  @Post('boards/:board/cards/:key/move')
  @BodySchema(MoveBody)
  async move(@Req() request: AuthedRequest, @Param('project') project: string, @Param('board') board: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(MoveBody, body);
    return this.boards.moveCard(organizationId, project, board, key, input.column, input.version, actor);
  }

  @Roles('athena-admin', 'athena-pm')
  @Post('sprints')  @BodySchema(SprintBody)

  async createSprint(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.manager(request, project);
    const input = parseBody(SprintBody, body);
    return { id: await this.sprints.create(organizationId, project, { name: input.name, startsOn: input.startsOn, endsOn: input.endsOn, ...(input.goal ? { goal: input.goal } : {}) }, actor) };
  }

  @Roles('athena-team-member', 'athena-admin')
  @HttpCode(204)
  @Post('sprints/:id/items')  @BodySchema(ItemBody)

  async addItem(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    await this.sprints.addItem(organizationId, id, parseBody(ItemBody, body).artifact, project, actor);
  }

  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Post('sprints/:id/start')
  async start(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string) {
    const { organizationId, actor } = await this.manager(request, project);
    await this.sprints.start(organizationId, id, actor);
  }

  /** Retire un ticket du sprint : il revient au backlog (T-0116). */
  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Delete('sprints/:id/items/:key')
  async removeItem(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string, @Param('key') key: string) {
    const { organizationId, actor } = await this.manager(request, project);
    await this.sprints.removeItem(organizationId, id, key, project, actor);
  }

  /** Clôture ; `moveTo` (facultatif) : sprint planifié qui reçoit les tickets non terminés, sinon ils retournent au backlog. */
  @Roles('athena-admin', 'athena-pm')
  @HttpCode(200)
  @Post('sprints/:id/close')
  @BodySchema(CloseBody)
  async close(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.manager(request, project);
    const input = parseBody(CloseBody, body ?? {});
    return this.sprints.close(organizationId, id, actor, input.moveTo);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('sprints')
  async sprintList(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.sprints.list((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('sprints/:id')
  async sprint(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.sprints.get((await this.ctx(request)).organizationId, id);
  }

  // --- Backlog (T-0115) : tickets des trackers Tâche hors sprint, dans l'ordre du rang ---
  @Roles('athena-team-member', 'athena-admin')
  @Get('backlog')
  async backlog(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId, actor } = await this.ctx(request);
    return { items: await this.backlogs.list(organizationId, project, actor.roles) };
  }

  /** Réordonne : place `key` après `after` (`null` : en tête). Réservé aux administrateurs et au chef de ce projet. */
  @Roles('athena-admin', 'athena-pm')
  @HttpCode(200)
  @Post('backlog/rank')
  @BodySchema(RankBody)
  async rankBacklog(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.manager(request, project);
    const input = parseBody(RankBody, body);
    return { items: await this.backlogs.rank(organizationId, project, input.key, input.after, actor) };
  }

  /** Sprint en cours ou planifié du ticket (en-tête de la fiche) ; `null` s'il n'est dans aucun. */
  @Roles('athena-team-member', 'athena-admin')
  @Get('artifacts/:key/sprint')
  async itemSprint(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    return { sprint: await this.sprints.ofItem((await this.ctx(request)).organizationId, project, key) };
  }

  // --- Pilotage : vélocité, flux, roadmap, tableau de bord ---
  @Roles('athena-team-member', 'athena-admin')
  @Get('velocity')
  async velocity(@Req() request: AuthedRequest, @Param('project') project: string, @Query('last') last = '10') {
    return this.reports.velocity((await this.ctx(request)).organizationId, project, Number(last) || 10);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('flow')
  async flow(@Req() request: AuthedRequest, @Param('project') project: string, @Query('days') days = '30') {
    return this.reports.cumulativeFlow((await this.ctx(request)).organizationId, project, Number(days));
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('roadmap')
  async roadmap(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.reports.roadmap((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @Post('releases')
  @BodySchema(CreateReleaseBody)
  async createRelease(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.manager(request, project);
    const input = parseBody(CreateReleaseBody, body);
    return { id: await this.reports.createRelease(organizationId, project, input, actor) };
  }

  @Roles('athena-team-member', 'athena-admin')
  @HttpCode(204)
  @Post('releases/:id/items')  @BodySchema(ItemBody)

  async assignRelease(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    await this.reports.assign(organizationId, project, id, parseBody(ItemBody, body).artifact, actor);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('releases/:id/items')
  async releaseItems(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string) {
    return this.reports.releaseItems((await this.ctx(request)).organizationId, project, id);
  }

  /** Retirer d'une version : réservé aux responsables du projet (T-0117). */
  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Delete('releases/:id/items/:key')
  async unassignRelease(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string, @Param('key') key: string) {
    const { organizationId, actor } = await this.manager(request, project);
    await this.reports.unassign(organizationId, project, id, key, actor);
  }

  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Post('releases/:id/publish')
  async publishRelease(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string) {
    const { organizationId, actor } = await this.manager(request, project);
    await this.reports.publish(organizationId, id, actor, project);
  }

  /** Agrégats de pilotage du projet (widgets Informations, Avancement, Indicateurs, Santé, Sprint ; ADR-0007). */
  @Roles('athena-team-member', 'athena-admin', 'athena-pm')
  @Get('kpis')
  async kpis(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId, actor } = await this.ctx(request);
    return this.kpi.kpis(organizationId, project, actor);
  }

  /** Dernières exécutions de pipeline des dépôts reliés au projet (widget Pipelines CI/CD). */
  @Roles('athena-team-member', 'athena-admin', 'athena-pm')
  @Get('pipelines')
  async pipelineRuns(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.pipelines.get((await this.ctx(request)).organizationId, project);
  }

  /** Mesures de qualité du code ; « non relié » sans fournisseur (widgets Qualité du code et Badges). */
  @Roles('athena-team-member', 'athena-admin', 'athena-pm')
  @Get('quality')
  async codeQuality(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.quality.get((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('dashboard')
  async dashboard(@Req() request: AuthedRequest, @Param('project') project: string, @Query('by') by?: string) {
    return this.reports.dashboard((await this.ctx(request)).organizationId, project, by);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('sprints/:id/burndown')
  async burndown(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.sprints.burndown((await this.ctx(request)).organizationId, id);
  }
}
