import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from './http';
import { PortfolioService } from './portfolio.service';
import { TeamService } from './team.service';

const Key = z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/);
const TeamCreate = z.object({ key: Key, name: z.string().trim().min(1).max(100), description: z.string().max(500).optional() });
const TeamPatch = z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().max(500).optional() });
const TeamMemberBody = z.object({ role: z.enum(['manager', 'member']) });
const PortfolioCreate = z.object({ key: Key, name: z.string().trim().min(1).max(100), description: z.string().max(500).optional(), owner: z.string().max(200).nullable().optional() });
const PortfolioPatch = z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().max(500).optional(), owner: z.string().max(200).nullable().optional() });
const PortfolioProjectBody = z.object({ health: z.enum(['ok', 'attention', 'critical']).nullable().optional(), note: z.string().max(500).optional() });

/** Équipes et charge : l'administrateur et le PMO les gèrent ; le manager voit la charge des siennes ; le directeur et le chef de projet lisent. */
@Controller('v1/teams')
export class TeamController {
  constructor(@Inject(TeamService) private readonly teams: TeamService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-manager', 'athena-director')
  @Get()
  async list(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.teams.list(organizationId, actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Post()
  @BodySchema(TeamCreate)
  async create(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.teams.create(organizationId, parseBody(TeamCreate, body), actor);
  }

  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-manager', 'athena-director')
  @Get(':key')
  async get(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.teams.get(organizationId, key, actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Patch(':key')
  @BodySchema(TeamPatch)
  async update(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.teams.update(organizationId, key, parseBody(TeamPatch, body), actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @HttpCode(204)
  @Delete(':key')
  async remove(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.teams.remove(organizationId, key, actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Put(':key/members/:subject')
  @BodySchema(TeamMemberBody)
  async setMember(@Req() request: AuthedRequest, @Param('key') key: string, @Param('subject') subject: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.teams.setMember(organizationId, key, subject, parseBody(TeamMemberBody, body).role, actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Delete(':key/members/:subject')
  async removeMember(@Req() request: AuthedRequest, @Param('key') key: string, @Param('subject') subject: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.teams.removeMember(organizationId, key, subject, actor);
  }

  /** Charge de l'équipe : tickets ouverts, en retard et reste à faire par personne. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-manager', 'athena-director')
  @Get(':key/load')
  async load(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.teams.load(organizationId, key, actor);
  }
}

/** Portefeuilles de projets : lecture pour le directeur et le chef de projet ; gestion pour l'administrateur et le PMO. */
@Controller('v1/portfolios')
export class PortfolioController {
  constructor(@Inject(PortfolioService) private readonly portfolios: PortfolioService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get()
  async list(@Req() request: AuthedRequest) {
    return this.portfolios.list((await this.orgs.resolve(request.principal!)).organizationId);
  }

  /** Tous les portefeuilles consolidés : le tableau de bord du directeur. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get('summary')
  async summaries(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.portfolios.summaries(organizationId, actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Post()
  @BodySchema(PortfolioCreate)
  async create(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.portfolios.create(organizationId, parseBody(PortfolioCreate, body), actor);
  }

  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key')
  async get(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.portfolios.summary(organizationId, key, actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Patch(':key')
  @BodySchema(PortfolioPatch)
  async update(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.portfolios.update(organizationId, key, parseBody(PortfolioPatch, body), actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @HttpCode(204)
  @Delete(':key')
  async remove(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.portfolios.remove(organizationId, key, actor);
  }

  /** Rattache un projet, force sa santé ou change sa note : réservé à l'administrateur et au chef de projet. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm')
  @Put(':key/projects/:project')
  @BodySchema(PortfolioProjectBody)
  async setProject(@Req() request: AuthedRequest, @Param('key') key: string, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.portfolios.setProject(organizationId, key, project, parseBody(PortfolioProjectBody, body), actor);
    return this.portfolios.summary(organizationId, key, actor);
  }

  @Roles('athena-admin', 'athena-pmo', 'athena-pm')
  @Delete(':key/projects/:project')
  async removeProject(@Req() request: AuthedRequest, @Param('key') key: string, @Param('project') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.portfolios.removeProject(organizationId, key, project, actor);
    return this.portfolios.summary(organizationId, key, actor);
  }
}
