import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { EarnedValueService } from './earned-value.service';
import { FeatureGuard, RequiresFeature } from './feature.service';
import { ConvertInput, RefuseInput, RequestService } from './request.service';
import { ScenarioInput, ScenarioService } from './scenario.service';
import { ObjectiveInput, ObjectiveLinkInput, ObjectiveService } from './objective.service';
import { ModelInput, ScoreInput, ScoringService } from './scoring.service';

const READERS = ['athena-admin', 'athena-pmo', 'athena-pm', 'athena-director'] as const;
const PMO = ['athena-admin', 'athena-pmo'] as const;

/** Priorisation, demandes, scénarios et valeur acquise d'un portefeuille (lot 25). Interrupteur `ppm.demand`. */
@Controller('v1')
@UseGuards(FeatureGuard)
@RequiresFeature('ppm.demand')
export class PrioritizationController {
  constructor(
    @Inject(ScoringService) private readonly scoring: ScoringService, @Inject(RequestService) private readonly requests: RequestService,
    @Inject(ScenarioService) private readonly scenarios: ScenarioService, @Inject(EarnedValueService) private readonly earned: EarnedValueService, @Inject(OrgResolver) private readonly orgs: OrgResolver,
    @Inject(ObjectiveService) private readonly objectives: ObjectiveService,
  ) {}

  @Roles(...READERS)
  @Get('portfolios/:key/objectives')
  async objectiveFlow(@Req() request: AuthedRequest, @Param('key') key: string) {
    return this.objectives.flow((await this.orgs.resolve(request.principal!)).organizationId, key);
  }

  @Roles(...PMO)
  @Post('objectives')
  @HttpCode(204)
  @BodySchema(ObjectiveInput)
  async objective(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.objectives.upsert(organizationId, parseBody(ObjectiveInput, body), actor);
  }

  @Roles(...PMO)
  @Post('objectives/:key/projects')
  @HttpCode(204)
  @BodySchema(ObjectiveLinkInput)
  async objectiveLink(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.objectives.link(organizationId, key, parseBody(ObjectiveLinkInput, body), actor);
  }

  @Roles(...READERS)
  @Get('portfolios/:key/ranking')
  async ranking(@Req() request: AuthedRequest, @Param('key') key: string, @Query('version') version?: string) {
    return this.scoring.ranking((await this.orgs.resolve(request.principal!)).organizationId, key, version ? Number(version) || undefined : undefined);
  }

  /** Nouveau modèle de scoring (une nouvelle version à chaque changement). */
  @Roles(...PMO)
  @Post('portfolios/:key/scoring-model')
  @HttpCode(201)
  @BodySchema(ModelInput)
  async model(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.scoring.createModel(organizationId, key, parseBody(ModelInput, body), actor);
  }

  @Roles(...PMO)
  @Post('portfolios/:key/scores')
  @HttpCode(204)
  @BodySchema(ScoreInput)
  async score(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.scoring.score(organizationId, key, parseBody(ScoreInput, body), actor);
  }

  @Roles(...PMO)
  @Post('requests/:ticket/convert')
  @HttpCode(200)
  @BodySchema(ConvertInput)
  async convert(@Req() request: AuthedRequest, @Param('ticket') ticket: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.requests.convert(organizationId, ticket, parseBody(ConvertInput, body), actor);
  }

  @Roles(...PMO)
  @Post('requests/:ticket/refuse')
  @HttpCode(200)
  @BodySchema(RefuseInput)
  async refuse(@Req() request: AuthedRequest, @Param('ticket') ticket: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.requests.refuse(organizationId, ticket, parseBody(RefuseInput, body), actor);
  }

  @Roles(...READERS)
  @Get('portfolios/:key/scenarios')
  async scenarioList(@Req() request: AuthedRequest, @Param('key') key: string) {
    return this.scenarios.list((await this.orgs.resolve(request.principal!)).organizationId, key);
  }

  @Roles(...PMO)
  @Post('portfolios/:key/scenarios')
  @HttpCode(201)
  @BodySchema(ScenarioInput)
  async scenarioCreate(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.scenarios.create(organizationId, key, parseBody(ScenarioInput, body), actor);
  }

  /** Calcule un scénario en lecture : rien n'est écrit dans le plan officiel. */
  @Roles(...READERS)
  @Get('portfolios/:key/scenarios/:id/evaluate')
  async scenarioEvaluate(@Req() request: AuthedRequest, @Param('key') key: string, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.scenarios.evaluate(organizationId, key, id, actor);
  }

  /** Valeur acquise : CPI et SPI par projet (lecteurs des finances). */
  @Roles('athena-admin', 'athena-finance', 'athena-pmo', 'athena-director')
  @Get('portfolios/:key/earned-value')
  async earnedValue(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return { rows: await this.earned.portfolio(organizationId, key, actor) };
  }
}
