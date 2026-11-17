import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { LifecycleInput } from './lifecycle';
import { LifecycleService } from './lifecycle.service';

const Transition = z.object({ to: z.string().regex(/^[a-z][a-z0-9_]{1,39}$/), reason: z.string().max(500).default('') });
const READERS = ['athena-team-member', 'athena-admin', 'athena-pmo', 'athena-pm', 'athena-qa', 'athena-manager', 'athena-director'] as const;

/** Cycle de vie des projets : configuration de l'organisation (administrateur), état et transitions d'un projet. */
@Controller('v1')
export class LifecycleController {
  constructor(@Inject(LifecycleService) private readonly lifecycle: LifecycleService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles(...READERS)
  @Get('lifecycle')
  async config(@Req() request: AuthedRequest) {
    return this.lifecycle.config((await this.orgs.resolve(request.principal!)).organizationId);
  }

  @Roles('athena-admin')
  @Put('admin/lifecycle')
  @BodySchema(LifecycleInput)
  async put(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.lifecycle.put(organizationId, parseBody(LifecycleInput, body), actor);
  }

  @Roles('athena-admin')
  @Delete('admin/lifecycle')
  @HttpCode(200)
  async reset(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.lifecycle.reset(organizationId, actor);
  }

  @Roles(...READERS)
  @Get('projects/:p/lifecycle')
  async forProject(@Req() request: AuthedRequest, @Param('p') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.lifecycle.forProject(organizationId, project, actor);
  }

  @Roles('athena-admin', 'athena-pmo', 'athena-pm')
  @Post('projects/:p/lifecycle/transition')
  @HttpCode(200)
  @BodySchema(Transition)
  async transition(@Req() request: AuthedRequest, @Param('p') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(Transition, body);
    return this.lifecycle.transition(organizationId, project, input.to, input.reason, actor);
  }
}
