import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from '../core/http';
import { ExportMarker } from '../core/export-marking';
import { FeatureGuard, RequiresFeature } from './feature.service';
import { RoadmapService } from './roadmap.service';
import { SnapshotService, type SnapshotKind } from './snapshot.service';
import { GovernanceService } from './governance.service';
import { DecisionInput, DecisionService } from './decision.service';
import { AlertService } from './alert.service';
import { ReviewCreate, ReviewPatch, ReviewService } from './review.service';
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
const RetentionBody = z.object({ weeks: z.number().int().min(1).max(520).nullable(), reviewMonths: z.number().int().min(1).max(600).nullable() });
const SnapshotBody = z.object({ kind: z.enum(['manual', 'review']).default('manual'), label: z.string().trim().max(200).optional() });
const PortfolioProjectBody = z.object({ health: z.enum(['ok', 'attention', 'critical']).nullable().optional(), note: z.string().max(500).optional(), kind: z.enum(['delivery', 'pilot']).optional(), purpose: z.string().max(200).optional() });

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
    @Inject(PortfolioService) private readonly portfolios: PortfolioService, @Inject(HealthService) private readonly healths: HealthService, @Inject(RoadmapService) private readonly roadmaps: RoadmapService, @Inject(SnapshotService) private readonly snapshots: SnapshotService, @Inject(ReviewService) private readonly reviews: ReviewService, @Inject(GovernanceService) private readonly governance: GovernanceService, @Inject(DecisionService) private readonly decisions: DecisionService, @Inject(AlertService) private readonly alertCenter: AlertService,
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

  /** Instantanés du portefeuille (lignes visibles du lecteur), du plus récent au plus ancien. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/snapshots')
  async snapshotList(@Req() request: AuthedRequest, @Param('key') key: string) {
    return this.snapshots.list((await this.orgs.resolve(request.principal!)).organizationId, key);
  }

  /** Comparaison de deux instantanés (`a` et `b`) : écarts par projet. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/snapshots/compare')
  async snapshotCompare(@Req() request: AuthedRequest, @Param('key') key: string, @Query('a') a = '', @Query('b') b = '') {
    return this.snapshots.compare((await this.orgs.resolve(request.principal!)).organizationId, key, a, b);
  }

  /** Dernier instantané et séries des mini-courbes, pour la flèche de tendance du tableau de santé. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/trend')
  async trend(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    const previous = await this.snapshots.previous(organizationId, key);
    return { previous: previous ? { id: previous.id, takenAt: previous.takenAt, kind: previous.kind, totals: previous.totals, lines: previous.lines } : null, series: await this.snapshots.series(organizationId, key) };
  }

  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/snapshots/:id')
  async snapshotGet(@Req() request: AuthedRequest, @Param('key') key: string, @Param('id') id: string) {
    return this.snapshots.get((await this.orgs.resolve(request.principal!)).organizationId, key, id);
  }

  /** Instantané manuel : le PMO et l'administrateur. */
  @Roles('athena-admin', 'athena-pmo')
  @Post(':key/snapshots')
  @HttpCode(201)
  @BodySchema(SnapshotBody)
  async snapshotTake(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(SnapshotBody, body ?? {});
    return this.snapshots.take(organizationId, key, { kind: input.kind as SnapshotKind, label: input.label ?? '' }, actor);
  }

  /** Rétention des instantanés propre au portefeuille (nul : réglage de l'organisation). */
  @Roles('athena-admin', 'athena-pmo')
  @Put(':key/snapshot-retention')
  @BodySchema(RetentionBody)
  async retention(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.snapshots.setRetention(organizationId, key, parseBody(RetentionBody, body), actor);
  }

  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/reviews')
  async reviewList(@Req() request: AuthedRequest, @Param('key') key: string) {
    return this.reviews.list((await this.orgs.resolve(request.principal!)).organizationId, key);
  }

  /** Dossier d'une revue : la revue et son instantané figé (lignes visibles du lecteur). */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/reviews/:id')
  async reviewGet(@Req() request: AuthedRequest, @Param('key') key: string, @Param('id') id: string) {
    return this.reviews.dossier((await this.orgs.resolve(request.principal!)).organizationId, key, id);
  }

  /** Crée une revue et fige l'instantané « revue » : le PMO et l'administrateur. */
  @Roles('athena-admin', 'athena-pmo')
  @Post(':key/reviews')
  @HttpCode(201)
  @BodySchema(ReviewCreate)
  async reviewCreate(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.reviews.create(organizationId, key, parseBody(ReviewCreate, body), actor);
  }

  @Roles('athena-admin', 'athena-pmo')
  @Patch(':key/reviews/:id')
  @BodySchema(ReviewPatch)
  async reviewPatch(@Req() request: AuthedRequest, @Param('key') key: string, @Param('id') id: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.reviews.update(organizationId, key, id, parseBody(ReviewPatch, body), actor);
  }

  /** Journal des décisions de portefeuille. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/decisions')
  async decisionList(@Req() request: AuthedRequest, @Param('key') key: string, @Query('project') project?: string, @Query('kind') kind?: string) {
    return this.decisions.list((await this.orgs.resolve(request.principal!)).organizationId, key, { ...(project ? { project } : {}), ...(kind ? { kind } : {}) });
  }

  /** Enregistre une décision (le PMO et l'administrateur) : suspendre, arrêter ou clôturer propose une transition, sans l'appliquer. */
  @Roles('athena-admin', 'athena-pmo')
  @Post(':key/decisions')
  @HttpCode(201)
  @BodySchema(DecisionInput)
  async decisionCreate(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.decisions.create(organizationId, key, parseBody(DecisionInput, body), actor);
  }

  /** Applique un changement chiffré en avenant de budget (finance et administrateur). */
  @Roles('athena-admin', 'athena-finance', 'athena-pmo')
  @Post(':key/decisions/:id/apply')
  @HttpCode(200)
  async decisionApply(@Req() request: AuthedRequest, @Param('key') key: string, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.decisions.apply(organizationId, key, id, actor);
  }

  /** Centre d'alertes du portefeuille, calculé à la lecture. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/alerts')
  async alerts(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return { alerts: await this.alertCenter.alerts(organizationId, key, actor) };
  }

  /** Tableau de passage des gates : gate en cours, revue prévue et état des critères de chaque projet à gabarit. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/gates')
  async gates(@Req() request: AuthedRequest, @Param('key') key: string) {
    return { rows: await this.governance.gates((await this.orgs.resolve(request.principal!)).organizationId, key) };
  }

  /** Matrice probabilité × impact des risques ouverts du portefeuille. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/risks')
  async risks(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.governance.riskMatrix(organizationId, key, actor);
  }

  /** Suivi des actions du portefeuille : ouvertes, en retard, closes. */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/actions')
  async actions(@Req() request: AuthedRequest, @Param('key') key: string) {
    return this.governance.actions((await this.orgs.resolve(request.principal!)).organizationId, key);
  }

  /** Courbe de tendance des jalons d'un projet (MTA). */
  @Roles('athena-admin', 'athena-pmo', 'athena-pm', 'athena-director')
  @Get(':key/milestone-trend/:project')
  async milestoneTrend(@Req() request: AuthedRequest, @Param('project') project: string) {
    return { series: await this.governance.milestoneTrend((await this.orgs.resolve(request.principal!)).organizationId, project) };
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
