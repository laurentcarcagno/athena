import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver } from '../core/http';
import { GovernanceService } from './governance.service';

/** Matrice probabilité × impact des risques ouverts d'un projet (carte « Risques consolidés » d'un tableau de bord de projet, lot 27). */
@Controller('v1/projects/:p')
export class ProjectRiskController {
  constructor(@Inject(GovernanceService) private readonly governance: GovernanceService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director', 'athena-qa')
  @Get('risk-matrix')
  async matrix(@Req() request: AuthedRequest, @Param('p') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.governance.projectRiskMatrix(organizationId, project, actor);
  }
}
