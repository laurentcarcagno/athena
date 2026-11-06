import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Put, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { AccessListInput, AccessService, ExportMembersInput, MarkingInput } from './access.service';
import { OrgResolver, parseBody } from './http';

/** Listes d'ayants droit d'un projet ou de l'un de ses trackers (administrateurs et chefs de projet). */
@Controller('v1/projects')
export class AccessController {
  constructor(
    @Inject(AccessService) private readonly access: AccessService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-admin', 'athena-pm')
  @Get(':project/access-lists')
  async list(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.access.list((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @Put(':project/access-lists')
  @BodySchema(AccessListInput)
  async set(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(AccessListInput, body);
    await this.access.set(organizationId, project, input, actor);
    return input;
  }

  @Roles('athena-admin', 'athena-pm')
  @Get(':project/export-control')
  async exportMembers(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.access.exportMembers((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @Put(':project/export-control')
  @BodySchema(ExportMembersInput)
  async setExportMembers(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(ExportMembersInput, body);
    await this.access.setExportMembers(organizationId, project, input, actor);
    return input;
  }

  /** Marquage de contrôle export d'un item : réservé aux responsables, audité. */
  @Roles('athena-admin', 'athena-pm')
  @Put(':project/artifacts/:key/marking')
  @BodySchema(MarkingInput)
  async setMarking(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.access.setMarking(organizationId, project, key, parseBody(MarkingInput, body).exportControl, actor);
  }

  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Delete(':project/access-lists')
  async remove(@Req() request: AuthedRequest, @Param('project') project: string, @Query('tracker') tracker?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.access.remove(organizationId, project, tracker && /^[A-Z][A-Z0-9]{1,9}$/.test(tracker) ? tracker : null, actor);
  }
}
