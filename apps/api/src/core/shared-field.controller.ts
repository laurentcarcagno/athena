import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from './http';
import { MemberService } from './member.service';
import { SharedFieldInput, SharedFieldService } from './shared-field.service';

/** Bibliothèque de champs partagés : de l'organisation (administrateur) ou d'un projet (chef du projet). Lecture : tout membre. */
@Controller('v1')
export class SharedFieldController {
  constructor(
    @Inject(SharedFieldService) private readonly shared: SharedFieldService, @Inject(OrgResolver) private readonly orgs: OrgResolver, @Inject(MemberService) private readonly members: MemberService,
  ) {}

  @Roles('athena-team-member', 'athena-admin')
  @Get('shared-fields')
  async listOrg(@Req() request: AuthedRequest) {
    return this.shared.list((await this.orgs.resolve(request.principal!)).organizationId);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('projects/:project/shared-fields')
  async listProject(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.shared.list((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Put('shared-fields/:key')
  @BodySchema(SharedFieldInput)
  async putOrg(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.shared.upsert(organizationId, {}, key, parseBody(SharedFieldInput, body), actor);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete('shared-fields/:key')
  async deleteOrg(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.shared.remove(organizationId, {}, key, actor);
  }

  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Put('projects/:project/shared-fields/:key')
  @BodySchema(SharedFieldInput)
  async putProject(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    await this.shared.upsert(organizationId, { project }, key, parseBody(SharedFieldInput, body), actor);
  }

  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Delete('projects/:project/shared-fields/:key')
  async deleteProject(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    await this.shared.remove(organizationId, { project }, key, actor);
  }
}
