import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from '../core/http';
import { ExportMarker } from '../core/export-marking';
import { FeatureGuard, RequiresFeature } from './feature.service';
import { RoadmapService } from './roadmap.service';
import { HealthService, healthCsv, type HealthFilter } from './health.service';
import { LIFECYCLE_CATEGORIES, type LifecycleCategory } from './lifecycle';
import { PortfolioService } from './portfolio.service';
import { UsageService } from './usage.service';
import { TeamService } from './team.service';

const Key = z.string().regex(/^[a-z0-9][a-z0-9-]{1,29}$/);
const TeamCreate = z.object({ key: Key, name: z.string().trim().min(1).max(100), description: z.string().max(500).optional() });
const TeamPatch = z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().max(500).optional() });
const TeamMemberBody = z.object({ role: z.enum(['manager', 'member']) });
const PortfolioCreate = z.object({ key: Key, name: z.string().trim().min(1).max(100), description: z.string().max(500).optional(), owner: z.string().max(200).nullable().optional() });
const PortfolioPatch = z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().max(500).optional(), owner: z.string().max(200).nullable().optional() });
/** Filtre du tableau de santé depuis la chaîne de requête ; une valeur inconnue est ignorée (jamais une erreur). */
export function parseHealthFilter(q: Record<string, string | undefined>): HealthFilter {
  const categories = (q['state'] ?? '').split(',').filter((c): c is LifecycleCategory => (LIFECYCLE_CATEGORIES as readonly string[]).includes(c));
  const health = q['health'] === 'ok' || q['health'] === 'attention' || q['health'] === 'critical' ? q['health'] : undefined;
  return {
    ...(categories.length ? { categories } : {}), ...(q['phase'] ? { phase: q['phase'] } : {}), ...(health ? { health } : {}),
    ...(q['sponsor'] ? { sponsor: q['sponsor'] } : {}), includeClosed: q['includeClosed'] === '1' || q['includeClosed'] === 'true',
  };
}
const PortfolioProjectBody = z.object({ health: z.enum(['ok', 'attention', 'critical']).nullable().optional(), note: z.string().max(500).optional() });

/** Équipes et charge : l'administrateur et le PMO les gèrent ; le manager voit la charge des siennes ; le directeur et le chef de projet lisent. */
@Controller('v1/teams')
@UseGuards(FeatureGuard)
@RequiresFeature('ppm.portfolios')
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
@UseGuards(FeatureGuard)
@RequiresFeature('ppm.portfolios')
export class PortfolioController {
  constructor(
    @Inject(PortfolioService) private readonly portfolios: PortfolioService, @Inject(HealthService) private readonly healths: HealthService, @Inject(RoadmapService) private readonly roadmaps: RoadmapService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
    @Inject(ExportMarker) private readonly marker: ExportMarker, @Inject(UsageService) private readonly usage: UsageService,
  ) {}

  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get()
  async list(@Req() request: AuthedRequest) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    void this.usage.hit(organizationId, request.principal!.roles, 'list');
    return this.portfolios.list(organizationId);
  }

  /** Tous les portefeuilles consolidés : le tableau de bord du directeur. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get('summary')
  async summaries(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    void this.usage.hit(organizationId, actor.roles, 'summary');
    return this.portfolios.summaries(organizationId, actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Post()
  @BodySchema(PortfolioCreate)
  async create(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.portfolios.create(organizationId, parseBody(PortfolioCreate, body), actor);
  }

  /** Roadmap consolidée : projets, phases, revues, versions et baseline (lecture seule). `includeClosed=1` ajoute les projets clos. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/roadmap')
  async roadmap(@Req() request: AuthedRequest, @Param('key') key: string, @Query('includeClosed') includeClosed?: string, @Query('baseline') baseline?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.roadmaps.roadmap(organizationId, key, actor, { includeClosed: includeClosed === '1' || includeClosed === 'true', ...(baseline ? { baseline } : {}) });
  }

  /** Journal d'usage agrégé (KPI 6) : compteurs quotidiens par rôle et route, sans identité ni contenu. */
  @Roles('athena-admin', 'athena-pmo')
  @Get('usage')
  async usageReport(@Req() request: AuthedRequest, @Query('days') days?: string) {
    return { rows: await this.usage.report((await this.orgs.resolve(request.principal!)).organizationId, days ? Number(days) || 30 : 30) };
  }

  /** Tableau de santé : calculée, déclarée et forcée, écart, dates, phase, prochaine revue, risque maximal. Filtres : `state` (catégories), `phase`, `health`, `sponsor`, `includeClosed`. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/health')
  async health(@Req() request: AuthedRequest, @Param('key') key: string, @Query() query: Record<string, string | undefined>, @Res({ passthrough: true }) reply: { header: (n: string, v: string) => unknown }) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const h = await this.healths.health(organizationId, key, actor, parseHealthFilter(query));
    void this.usage.hit(organizationId, actor.roles, query['format'] === 'csv' ? 'health_csv' : 'health');
    if (query['format'] !== 'csv') return h;
    reply.header('Content-Type', 'text/csv; charset=utf-8');
    reply.header('Content-Disposition', `attachment; filename="sante-${key}.csv"`);
    return this.marker.csv(healthCsv(h));
  }

  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key')
  async get(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    void this.usage.hit(organizationId, actor.roles, 'detail');
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
