import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from './http';
import { TrackerTypeInput, TrackerTypeService } from './tracker-type.service';
import { TYPE_KEY } from './tracker-types';

const CreateBody = TrackerTypeInput.extend({ key: z.string().regex(TYPE_KEY, 'clé en minuscules, chiffres et tirets, 2 à 40 caractères') });

/** Types de tracker de l'organisation (lecture pour tous, administration réservée aux administrateurs). */
@Controller('v1/tracker-types')
export class TrackerTypeController {
  constructor(
    @Inject(TrackerTypeService) private readonly types: TrackerTypeService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-user', 'athena-admin')
  @Get()
  async list(@Req() request: AuthedRequest) {
    return this.types.list((await this.orgs.resolve(request.principal!)).organizationId);
  }

  @Roles('athena-admin')
  @Post()
  @BodySchema(CreateBody)
  async create(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const { key, ...input } = parseBody(CreateBody, body);
    await this.types.create(organizationId, key, input, actor);
    return { key };
  }

  /** Modifie un type ; pour un type livré, enregistre une version de l'organisation sous la même clé. */
  @Roles('athena-admin')
  @Put(':key')
  @BodySchema(TrackerTypeInput)
  async update(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.types.update(organizationId, key, parseBody(TrackerTypeInput, body), actor);
    return { key };
  }

  /** Supprime un type de l'organisation ; pour un type livré modifié, rétablit sa version d'origine. */
  @Roles('athena-admin')
  @HttpCode(204)
  @Delete(':key')
  async remove(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.types.remove(organizationId, key, actor);
  }
}
