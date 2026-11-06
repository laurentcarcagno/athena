import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { CoverageRuleInput, CoverageService } from './coverage.service';
import { OrgResolver, parseBody } from './http';

const RuleKey = z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/, 'clé en minuscules, chiffres, tirets');
const CreateBody = CoverageRuleInput.extend({ key: RuleKey });

/** Règles de couverture : lecture pour tous, écriture réservée aux administrateurs (règles d'organisation et de projet). */
@Controller('v1')
export class CoverageController {
  constructor(
    @Inject(CoverageService) private readonly coverage: CoverageService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin')
  @Get('coverage-rules')
  async orgRules(@Req() request: AuthedRequest) {
    return this.coverage.list((await this.orgs.resolve(request.principal!)).organizationId, null);
  }

  @Roles('athena-admin')
  @Post('coverage-rules')
  @BodySchema(CreateBody)
  async createOrg(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const { key, ...input } = parseBody(CreateBody, body);
    await this.coverage.create(organizationId, null, key, input, actor);
    return { key };
  }

  @Roles('athena-admin')
  @Put('coverage-rules/:key')
  @BodySchema(CoverageRuleInput)
  async updateOrg(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.coverage.update(organizationId, null, key, parseBody(CoverageRuleInput, body), actor);
    return { key };
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete('coverage-rules/:key')
  async removeOrg(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.coverage.remove(organizationId, null, key, actor);
  }

  /** Résultat de chaque règle applicable au projet : taux, items en défaut, items à lien suspect. */
  @Roles('athena-user', 'athena-admin')
  @Get('projects/:project/coverage')
  async evaluate(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.coverage.evaluate(organizationId, project, actor.roles);
  }

  @Roles('athena-admin')
  @Post('projects/:project/coverage-rules')
  @BodySchema(CreateBody)
  async createProject(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const { key, ...input } = parseBody(CreateBody, body);
    await this.coverage.create(organizationId, project, key, input, actor);
    return { key };
  }

  @Roles('athena-admin')
  @Put('projects/:project/coverage-rules/:key')
  @BodySchema(CoverageRuleInput)
  async updateProject(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.coverage.update(organizationId, project, key, parseBody(CoverageRuleInput, body), actor);
    return { key };
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete('projects/:project/coverage-rules/:key')
  async removeProject(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.coverage.remove(organizationId, project, key, actor);
  }
}
