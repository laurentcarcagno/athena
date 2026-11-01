import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from './http';
import { MemberService } from './member.service';

const MemberBody = z.object({ role: z.enum(['manager', 'member']) });

@Controller('v1')
export class MemberController {
  constructor(
    @Inject(MemberService) private readonly members: MemberService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  /** Comptes connus de l'organisation, pour choisir les acteurs d'un projet. */
  @Roles('athena-admin', 'athena-pm')
  @Get('users')
  async users(@Req() request: AuthedRequest) {
    return this.members.users((await this.orgs.resolve(request.principal!)).organizationId);
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm')
  @Get('projects/:project/members')
  async list(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.members.members((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @Put('projects/:project/members/:subject')
  @BodySchema(MemberBody)
  async set(@Req() request: AuthedRequest, @Param('project') project: string, @Param('subject') subject: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    await this.members.set(organizationId, project, subject, parseBody(MemberBody, body).role, actor);
    return this.members.members(organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Delete('projects/:project/members/:subject')
  async remove(@Req() request: AuthedRequest, @Param('project') project: string, @Param('subject') subject: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    await this.members.remove(organizationId, project, subject, actor);
  }
}
