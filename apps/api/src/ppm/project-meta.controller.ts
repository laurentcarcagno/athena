import { Body, Controller, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { MemberService } from '../core/member.service';
import { BodySchema } from '../openapi/body-schema';
import { ProjectMetaInput, ProjectMetaService } from './project-meta.service';

/** Méta du projet : lue par ceux qui voient le projet, écrite par l'administrateur et le chef désigné du projet. */
@Controller('v1/projects/:p/meta')
export class ProjectMetaController {
  constructor(
    @Inject(ProjectMetaService) private readonly meta: ProjectMetaService,
    @Inject(MemberService) private readonly members: MemberService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-team-member', 'athena-admin', 'athena-pmo', 'athena-pm', 'athena-qa', 'athena-manager', 'athena-director')
  @Get()
  async get(@Req() request: AuthedRequest, @Param('p') project: string) {
    return this.meta.get((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @Patch()
  @BodySchema(ProjectMetaInput)
  async patch(@Req() request: AuthedRequest, @Param('p') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    return this.meta.patch(organizationId, project, parseBody(ProjectMetaInput, body), actor);
  }
}
