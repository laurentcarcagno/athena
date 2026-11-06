import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver } from './http';
import { TreeService } from './tree.service';

@Controller('v1/projects')
export class TreeController {
  constructor(
    @Inject(TreeService) private readonly tree: TreeService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  /** Racines du tracker, ou enfants directs de `parent` : un niveau par appel. */
  @Roles('athena-user', 'athena-admin')
  @Get(':project/trackers/:tracker/tree')
  async children(@Req() request: AuthedRequest, @Param('project') project: string, @Param('tracker') tracker: string, @Query('parent') parent?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.tree.children(organizationId, project, tracker, parent ? parent.slice(0, 80) : null, actor.roles);
  }
}
