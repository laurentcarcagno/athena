import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { z } from 'zod';
import { GraphqlService } from './graphql.service';

const GraphqlBody = z.object({ query: z.string().max(20_000), variables: z.record(z.string(), z.unknown()).optional(), operationName: z.string().max(100).optional() });

/** GraphQL en lecture seule (plan § 3.1) : mêmes droits que l'API REST, requêtes bornées en taille et en profondeur. */
@Controller('v1')
export class GraphqlController {
  constructor(@Inject(GraphqlService) private readonly graphql: GraphqlService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles('athena-team-member', 'athena-admin')
  @Post('graphql')
  @HttpCode(200)
  @BodySchema(GraphqlBody)
  async post(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.graphql.run((body ?? {}) as Record<string, unknown>, { organizationId, actor });
  }

  /** Forme GET (lecture, mise en cache par le navigateur désactivée) : `?query=...&variables={...}`. */
  @Roles('athena-team-member', 'athena-admin')
  @Get('graphql')
  async get(@Req() request: AuthedRequest, @Query('query') query?: string, @Query('variables') variables?: string, @Query('operationName') operationName?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    let parsed: unknown;
    try { parsed = variables ? JSON.parse(variables) : undefined; } catch { return { errors: [{ message: 'variables : JSON invalide.' }] }; }
    return this.graphql.run({ query, variables: parsed, operationName }, { organizationId, actor });
  }
}
