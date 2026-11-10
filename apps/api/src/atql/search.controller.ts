import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { BodySchema } from '../openapi/body-schema';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { SavedSearchService } from './saved-search.service';
import { SearchService } from './search.service';

const SavedSearchBody = z.object({
  name: z.string().trim().min(1).max(100), query: z.string().max(2000),
  projects: z.array(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/)).max(50).optional(),
});

/**
 * Recherche globale (ADR-0003, T-0118) : `GET /v1/search?q=<ATQL>&project=A,B&limit&offset`, et recherches enregistrées
 * personnelles (`/v1/searches`). Sans `project`, toute l'organisation ; les listes d'ayants droit filtrent les projets et
 * trackers non autorisés.
 */
@Controller('v1')
export class SearchController {
  constructor(
    @Inject(SearchService) private readonly searcher: SearchService,
    @Inject(SavedSearchService) private readonly saved: SavedSearchService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin')
  @Get('search')
  async search(
    @Req() request: AuthedRequest, @Query('q') q = '', @Query('project') project = '', @Query('limit') limit = '50', @Query('offset') offset = '0',
  ) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const projects = String(project).split(',').map((p) => p.trim()).filter(Boolean);
    return this.searcher.searchOrganization(organizationId, String(q), actor.id, { projects, limit: Number(limit), offset: Number(offset), roles: actor.roles });
  }

  @Roles('athena-user', 'athena-admin')
  @Get('searches')
  async list(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.saved.list(organizationId, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Post('searches')
  @BodySchema(SavedSearchBody)
  async create(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.saved.create(organizationId, parseBody(SavedSearchBody, body), actor);
  }

  @Roles('athena-user', 'athena-admin')
  @HttpCode(204)
  @Delete('searches/:id')
  async remove(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.saved.remove(organizationId, id, actor);
  }
}
