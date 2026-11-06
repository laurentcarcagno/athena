import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver } from './http';
import { ProjectOverviewService } from './project-overview.service';

@Controller('v1/projects')
export class ProjectOverviewController {
  constructor(
    @Inject(ProjectOverviewService) private readonly overview: ProjectOverviewService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  /** Onglets actifs du projet, dans l'ordre fixe. */
  @Roles('athena-user', 'athena-admin')
  @Get(':project/modules')
  async modules(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.overview.modules((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  /** Carte des trackers : compteurs par statut, éléments à moi, dernière activité. */
  @Roles('athena-user', 'athena-admin')
  @Get(':project/overview')
  async overviewOf(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.overview.overview(organizationId, project, request.principal!.username);
  }
}
