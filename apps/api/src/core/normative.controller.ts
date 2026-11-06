import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { ExportMarker } from './export-marking';
import { OrgResolver, parseBody } from './http';
import { NormativeService, TailoringInput } from './normative.service';

const ImportBody = z.object({ csv: z.string().min(1).max(20_000_000), standard: z.string().trim().max(200).optional(), tracker: z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/).optional() });
const Category = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,19}$/).optional();

/** Exigences normatives d'un projet : import des clauses, tailoring et matrice de conformité (lecture pour tous, écriture pour les responsables). */
@Controller('v1/projects')
export class NormativeController {
  constructor(
    @Inject(NormativeService) private readonly normative: NormativeService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
    @Inject(ExportMarker) private readonly marker: ExportMarker,
  ) {}

  @Roles('athena-admin', 'athena-pm')
  @Post(':project/clauses/import')
  @HttpCode(200)
  @BodySchema(ImportBody)
  async importClauses(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(ImportBody, body);
    return this.normative.importClauses(organizationId, project, { csv: input.csv, ...(input.standard ? { standard: input.standard } : {}), ...(input.tracker ? { tracker: input.tracker } : {}) }, actor);
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm')
  @Get(':project/tailoring')
  async tailoring(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.normative.listTailoring((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @Put(':project/tailoring')
  @BodySchema(TailoringInput)
  async setTailoring(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(TailoringInput, body);
    await this.normative.setTailoring(organizationId, project, input, actor);
    return input;
  }

  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Delete(':project/tailoring/:category/:clause')
  async clearTailoring(@Req() request: AuthedRequest, @Param('project') project: string, @Param('category') category: string, @Param('clause') clause: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.normative.setTailoring(organizationId, project, { clause: decodeURIComponent(clause), category: category === '_all' ? '*' : category, applicability: 'applicable', justification: '' }, actor);
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm')
  @Get(':project/conformity')
  async conformity(@Req() request: AuthedRequest, @Param('project') project: string, @Query('category') category?: string) {
    return this.normative.conformity((await this.orgs.resolve(request.principal!)).organizationId, project, Category.parse(category || undefined));
  }

  @Roles('athena-user', 'athena-admin', 'athena-pm')
  @Get(':project/conformity/export')
  async conformityExport(@Req() request: AuthedRequest, @Param('project') project: string, @Query('category') category?: string) {
    const out = await this.normative.conformityCsv((await this.orgs.resolve(request.principal!)).organizationId, project, Category.parse(category || undefined));
    return this.marker.json({ ...out, csv: this.marker.csv(out.csv) });
  }
}
