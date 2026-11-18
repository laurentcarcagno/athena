import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { Db } from '../core/db';
import { OrgResolver, parseBody } from '../core/http';
import { BodySchema } from '../openapi/body-schema';
import { z } from 'zod';
import { PrivacyService } from './privacy.service';

const ME = ['athena-team-member', 'athena-admin', 'athena-pm', 'athena-pmo', 'athena-director', 'athena-finance'] as const;
export const EraseInput = z.object({ confirm: z.literal('effacer') });

@Controller('v1')
export class PrivacyController {
  private readonly privacy: PrivacyService;
  constructor(@Inject(Db) db: Db, @Inject(OrgResolver) private readonly orgs: OrgResolver) {
    this.privacy = new PrivacyService(db);
  }

  /** Export de ses propres données (droit d'accès). */
  @Roles(...ME)
  @Get('me/data-export')
  @Header('Content-Disposition', 'attachment; filename="athena-mes-donnees.json"')
  async exportMine(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.privacy.export(organizationId, actor.id);
  }

  /** Export des données d'une personne, par l'administrateur (demande d'accès instruite par le délégué à la protection des données). */
  @Roles('athena-admin')
  @Get('admin/users/:subject/data-export')
  @Header('Content-Disposition', 'attachment; filename="athena-donnees-utilisateur.json"')
  async exportOf(@Req() request: AuthedRequest, @Param('subject') subject: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.privacy.export(organizationId, subject);
  }

  /** Effacement (pseudonymisation) d'une personne ; la confirmation explicite est obligatoire. */
  @Roles('athena-admin')
  @Post('admin/users/:subject/erase')
  @HttpCode(200)
  @BodySchema(EraseInput)
  async erase(@Req() request: AuthedRequest, @Param('subject') subject: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    parseBody(EraseInput, body);
    return this.privacy.erase(organizationId, subject, actor);
  }
}
