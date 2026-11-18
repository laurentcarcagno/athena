import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { Roles, type AuthedRequest } from './auth.guard';
import { PAT_SERVICE } from './auth.tokens';
import { PatInput, type PatService } from './pat.service';

const ME = ['athena-team-member', 'athena-admin', 'athena-pm', 'athena-pmo', 'athena-director', 'athena-finance'] as const;

/** Gestion de ses propres jetons d'accès personnels. Un jeton ne peut pas servir à en créer ou en révoquer (pas d'escalade par chaîne). */
@Controller('v1/me/tokens')
export class PatController {
  constructor(@Inject(PAT_SERVICE) private readonly pats: PatService, @Inject(OrgResolver) private readonly orgs: OrgResolver) {}

  private refuseToken(request: AuthedRequest): void {
    if ((request.principal as { patId?: string } | undefined)?.patId) throw new ForbiddenException('Un jeton d’accès personnel ne peut pas gérer les jetons.');
  }

  @Roles(...ME)
  @Get()
  async list(@Req() request: AuthedRequest) {
    this.refuseToken(request);
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.pats.list(organizationId, actor.id);
  }

  /** Le jeton en clair n'est renvoyé qu'ici, une seule fois. */
  @Roles(...ME)
  @Post()
  @HttpCode(201)
  @BodySchema(PatInput)
  async create(@Req() request: AuthedRequest, @Body() body: unknown) {
    this.refuseToken(request);
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.pats.create(organizationId, request.principal!, parseBody(PatInput, body), actor);
  }

  @Roles(...ME)
  @Delete(':id')
  @HttpCode(204)
  async revoke(@Req() request: AuthedRequest, @Param('id') id: string) {
    this.refuseToken(request);
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.pats.revoke(organizationId, actor.id, id, actor);
  }
}
