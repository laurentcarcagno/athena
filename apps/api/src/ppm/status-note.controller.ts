import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { MemberService } from '../core/member.service';
import { BodySchema } from '../openapi/body-schema';
import { StatusNoteInput, StatusNoteService } from './status-note.service';

/** Météo du projet : lue par ceux qui voient le projet, écrite par son chef (ou l'administrateur). */
@Controller('v1/projects/:p/status-notes')
export class StatusNoteController {
  constructor(
    @Inject(StatusNoteService) private readonly notes: StatusNoteService,
    @Inject(MemberService) private readonly members: MemberService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-team-member', 'athena-admin', 'athena-pmo', 'athena-pm', 'athena-qa', 'athena-manager', 'athena-director')
  @Get()
  async list(@Req() request: AuthedRequest, @Param('p') project: string, @Query('limit') limit?: string) {
    return this.notes.list((await this.orgs.resolve(request.principal!)).organizationId, project, limit ? Number(limit) || 20 : 20);
  }

  @Roles('athena-admin', 'athena-pm')
  @Post()
  @HttpCode(201)
  @BodySchema(StatusNoteInput)
  async write(@Req() request: AuthedRequest, @Param('p') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.members.requireManager(organizationId, project, actor);
    return this.notes.write(organizationId, project, parseBody(StatusNoteInput, body), actor);
  }
}
