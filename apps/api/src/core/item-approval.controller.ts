import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { FlowInput, ItemApprovalService, ItemDecisionInput } from './item-approval.service';
import { OrgResolver, parseBody } from './http';

/**
 * Circuits d'approbation des items. Le circuit se définit sur le tracker (responsables et administrateurs) ; les décisions sont
 * nominatives et ne sont acceptées que des personnes désignées à l'étape courante (ou du rôle assurance qualité étatique).
 */
@Controller('v1/projects')
export class ItemApprovalController {
  constructor(
    @Inject(ItemApprovalService) private readonly approvals: ItemApprovalService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get(':project/trackers/:tracker/approval-flow')
  async flow(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string) {
    return this.approvals.getFlow((await this.orgs.resolve(request.principal!)).organizationId, project, tracker);
  }

  @Roles('athena-admin', 'athena-pm')
  @Put(':project/trackers/:tracker/approval-flow')
  @BodySchema(FlowInput)
  async setFlow(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.approvals.setFlow(organizationId, project, tracker, parseBody(FlowInput, body), actor);
    return this.approvals.getFlow(organizationId, project, tracker);
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get(':project/artifacts/:key/approval')
  async state(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.approvals.get(organizationId, project, key, { subject: actor.id, roles: request.principal!.roles });
  }

  @Roles('athena-user', 'athena-admin', 'athena-qa')
  @Post(':project/artifacts/:key/approval/decision')
  @HttpCode(200)
  @BodySchema(ItemDecisionInput)
  async decide(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const p = request.principal!;
    return this.approvals.decide(organizationId, project, key, parseBody(ItemDecisionInput, body), { subject: actor.id, name: p.name ?? p.username, roles: p.roles }, actor);
  }
}
