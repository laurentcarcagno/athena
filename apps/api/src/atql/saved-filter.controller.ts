import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { BodySchema } from '../openapi/body-schema';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { SavedFilterService } from './saved-filter.service';

const CreateBody = z.object({ name: z.string().trim().min(1).max(100), query: z.string().max(2000), shared: z.boolean().optional() });
@Controller('v1/projects/:project/filters')
export class SavedFilterController {
  constructor(
    @Inject(SavedFilterService) private readonly filters: SavedFilterService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin')
  @Get()
  async list(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.filters.list(organizationId, project, actor);
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
  @Delete(':id')
  async remove(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.filters.remove(organizationId, project, id, actor);
  }
}
