import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { BodySchema } from '../openapi/body-schema';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { SavedFilterService } from './saved-filter.service';

const CreateBody = z.object({
  name: z.string().trim().min(1).max(100), query: z.string().max(2000), shared: z.boolean().optional(),
  trackerKey: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/).optional(), view: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).optional(),
  columns: z.array(z.string().max(60)).max(30).optional(), isDefault: z.boolean().optional(),
});
const DefaultBody = z.object({ isDefault: z.boolean() });
@Controller('v1/projects/:project/filters')
export class SavedFilterController {
  constructor(
    @Inject(SavedFilterService) private readonly filters: SavedFilterService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin')
  @Get()
  async list(@Req() request: AuthedRequest, @Param('project') project: string, @Query('tracker') tracker?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.filters.list(organizationId, project, actor, tracker && /^[A-Z][A-Z0-9]{1,9}$/.test(tracker) ? tracker : undefined);
  }

  @Roles('athena-user', 'athena-admin')
  @Post()
  @BodySchema(CreateBody)
  async create(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(CreateBody, body);
    return this.filters.create(organizationId, project, input, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(204)
  @Patch(':id')
  @BodySchema(DefaultBody)
  async setDefault(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.filters.setDefault(organizationId, project, id, parseBody(DefaultBody, body).isDefault, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(204)
  @Delete(':id')
  async remove(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.filters.remove(organizationId, project, id, actor);
  }
}
