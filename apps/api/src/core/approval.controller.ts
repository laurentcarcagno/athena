import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { APPROVAL_TYPES, ApprovalService, DecisionInput, RequiredInput, type ApprovalType } from './approval.service';
import { validation } from './errors';
import { OrgResolver, parseBody } from './http';

const typeOf = (value: string): ApprovalType => {
  if (!(APPROVAL_TYPES as readonly string[]).includes(value)) throw validation([`type inconnu : ${value} (release ou baseline)`]);
  return value as ApprovalType;
};

/** Approbation des jalons et baselines : lecture pour tous, décision réservée à l'assurance qualité étatique, exigence aux responsables. */
@Controller('v1/projects')
export class ApprovalController {
  constructor(
    @Inject(ApprovalService) private readonly approvals: ApprovalService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-team-member', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get(':project/approvals')
  async list(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.approvals.list((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @Put(':project/approvals/:type/:ref/required')
  @BodySchema(RequiredInput)
  async setRequired(@Req() request: AuthedRequest, @Param('project') project: string, @Param('type') type: string, @Param('ref') ref: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(RequiredInput, body);
    await this.approvals.setRequired(organizationId, project, typeOf(type), ref, input.required, actor);
    return input;
  }

  /** Décision nominative de l'assurance qualité étatique (rôle `athena-qa`). */
  @Roles('athena-qa')
  @Post(':project/approvals/:type/:ref/decision')
  @HttpCode(200)
  @BodySchema(DecisionInput)
  async decide(@Req() request: AuthedRequest, @Param('project') project: string, @Param('type') type: string, @Param('ref') ref: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const p = request.principal!;
    return this.approvals.decide(organizationId, project, typeOf(type), ref, parseBody(DecisionInput, body), { id: p.subject, name: p.name ?? p.username }, actor);
  }
}
