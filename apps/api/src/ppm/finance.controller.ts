import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { z } from 'zod';
import { FeatureGuard, RequiresFeature } from './feature.service';
import { ActualInput, BudgetInput, CategoryInput, CommitmentInput, FinanceService, ForecastInput, RateInput } from './finance.service';

const READERS = ['athena-admin', 'athena-finance', 'athena-pmo', 'athena-director'] as const;
const WRITERS = ['athena-admin', 'athena-finance', 'athena-pmo'] as const;
const ImportBody = z.object({ fileName: z.string().trim().min(1).max(200), content: z.string().min(1).max(20_000_000) });

/** Finances (lot 23) : lecture pour la finance, l'administrateur, le PMO et la direction ; écriture pour la finance et l'administrateur. Interrupteur `ppm.finance`. */
@Controller('v1/finance')
@UseGuards(FeatureGuard)
@RequiresFeature('ppm.finance')
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly finance: FinanceService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  @Roles(...READERS)
  @Get('categories')
  async categories(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.finance.categories(organizationId, actor);
  }

  @Roles(...WRITERS)
  @Put('categories')
  @BodySchema(CategoryInput)
  async category(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.finance.upsertCategory(organizationId, parseBody(CategoryInput, body), actor);
    return this.finance.categories(organizationId, actor);
  }

  /** Le chef de projet lit aussi les finances de son projet (carte « Finances du projet », lot 27) ; la base ne lui montre que les projets dont il est responsable. */
  @Roles(...READERS, 'athena-pm')
  @Get('projects/:p')
  async project(@Req() request: AuthedRequest, @Param('p') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.finance.project(organizationId, project, actor);
  }

  @Roles(...WRITERS)
  @Post('budget')
  @HttpCode(201)
  @BodySchema(BudgetInput)
  async budget(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.finance.addBudget(organizationId, parseBody(BudgetInput, body), actor);
  }

  @Roles(...WRITERS)
  @Post('commitments')
  @HttpCode(201)
  @BodySchema(CommitmentInput)
  async commitment(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.finance.addCommitment(organizationId, parseBody(CommitmentInput, body), actor);
  }

  @Roles(...WRITERS)
  @Post('actuals')
  @HttpCode(201)
  @BodySchema(ActualInput)
  async actual(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.finance.addActual(organizationId, parseBody(ActualInput, body), actor);
  }

  @Roles(...WRITERS)
  @Put('forecasts')
  @BodySchema(ForecastInput)
  async forecast(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.finance.setForecast(organizationId, parseBody(ForecastInput, body), actor);
  }

  /** Import des réels (CSV `projet;catégorie;période;montant`), idempotent par empreinte, rejet ligne à ligne avec rapport. */
  @Roles(...WRITERS)
  @Post('actuals/import')
  @HttpCode(200)
  @BodySchema(ImportBody)
  async importActuals(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(ImportBody, body);
    return this.finance.importActuals(organizationId, input.fileName, input.content, actor);
  }

  @Roles(...WRITERS)
  @Get('rates')
  async rates(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.finance.rates(organizationId, actor);
  }

  @Roles(...WRITERS)
  @Post('rates')
  @HttpCode(201)
  @BodySchema(RateInput)
  async rate(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.finance.addRate(organizationId, parseBody(RateInput, body), actor);
  }

  @Roles(...WRITERS)
  @Get('projects/:p/time-cost')
  async timeCost(@Req() request: AuthedRequest, @Param('p') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.finance.timeCost(organizationId, project, actor);
  }
}
