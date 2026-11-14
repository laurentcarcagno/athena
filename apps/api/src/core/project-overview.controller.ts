import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver } from './http';
import { ACTIVITY_KINDS, ProjectOverviewService, type ActivityKind } from './project-overview.service';

@Controller('v1/projects')
export class ProjectOverviewController {
  constructor(
    @Inject(ProjectOverviewService) private readonly overview: ProjectOverviewService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  /** Onglets actifs du projet, dans l'ordre fixe. */
  @Roles('athena-team-member', 'athena-admin')
  @Get(':project/modules')
  async modules(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.overview.modules((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  /** Flux d'activité du projet (filtrable par tracker, personne et type d'événement), paginé par curseur. */
  @Roles('athena-team-member', 'athena-admin')
  @Get(':project/activity')
  async activity(
    @Req() request: AuthedRequest, @Param('project') project: string, @Query('tracker') tracker?: string, @Query('actor') actor?: string,
    @Query('kind') kind?: string, @Query('before') before?: string, @Query('limit') limit?: string,
  ) {
    const { organizationId, actor: me } = await this.orgs.resolve(request.principal!);
    return this.overview.activity(organizationId, project, me.roles, {
      ...(tracker && /^[A-Z][A-Z0-9]{1,9}$/.test(tracker) ? { tracker } : {}), ...(actor ? { actor: actor.slice(0, 200) } : {}),
      ...(kind && (ACTIVITY_KINDS as readonly string[]).includes(kind) ? { kind: kind as ActivityKind } : {}), ...(before ? { before } : {}), ...(limit ? { limit: Number(limit) || 30 } : {}),
    });
  }

  /** Carte des trackers : compteurs par statut, éléments à moi, dernière activité. */
  @Roles('athena-team-member', 'athena-admin')
  @Get(':project/overview')
  async overviewOf(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.overview.overview(organizationId, project, request.principal!.username);
  }
}
