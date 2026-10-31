import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { BoardService } from './board.service';
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

@Controller('v1/projects/:project')
export class AgileController {
  constructor(private readonly orgs: OrgResolver, private readonly boards: BoardService, private readonly sprints: SprintService) {}

  private ctx = (request: AuthedRequest) => this.orgs.resolve(request.principal!);

  @Roles('athena-admin')
  @Post('boards')
  async createBoard(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(BoardBody, body);
    await this.boards.create(organizationId, project, { ...input, columns: input.columns.map((c) => ({ ...c, ...(c.wipLimit === undefined ? { wipLimit: undefined } : {}) })) }, actor);
    return { key: input.key };
  }

  @Roles('athena-user', 'athena-admin')
  @Get('boards')
  async boardList(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.boards.list((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-user', 'athena-admin')
  @Get('boards/:board')
  async board(@Req() request: AuthedRequest, @Param('project') project: string, @Param('board') board: string) {
    return this.boards.view((await this.ctx(request)).organizationId, project, board);
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(200)
  @Post('boards/:board/cards/:key/move')
  async move(@Req() request: AuthedRequest, @Param('project') project: string, @Param('board') board: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(MoveBody, body);
    return this.boards.moveCard(organizationId, project, board, key, input.column, input.version, actor);
  }

  @Roles('athena-admin')
  @Post('sprints')
  async createSprint(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(SprintBody, body);
    return { id: await this.sprints.create(organizationId, project, { name: input.name, startsOn: input.startsOn, endsOn: input.endsOn, ...(input.goal ? { goal: input.goal } : {}) }, actor) };
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(204)
  @Post('sprints/:id/items')
  async addItem(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    await this.sprints.addItem(organizationId, id, parseBody(ItemBody, body).artifact, project, actor);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Post('sprints/:id/start')
  async start(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.ctx(request);
    await this.sprints.start(organizationId, id, actor);
  }

  @Roles('athena-admin')
  @HttpCode(200)
  @Post('sprints/:id/close')
  async close(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.ctx(request);
    return this.sprints.close(organizationId, id, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Get('sprints/:id')
  async sprint(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.sprints.get((await this.ctx(request)).organizationId, id);
  }

  @Roles('athena-user', 'athena-admin')
  @Get('sprints/:id/burndown')
  async burndown(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.sprints.burndown((await this.ctx(request)).organizationId, id);
  }
}
