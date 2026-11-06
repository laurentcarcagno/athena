import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from './http';
import { LinkTypeInput, LinkTypeService } from './link-type.service';

const CreateBody = LinkTypeInput.extend({ key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'clé en minuscules, chiffres et tirets bas') });

/** Types de liens de l'organisation : lecture pour tous, administration réservée aux administrateurs. */
@Controller('v1/link-types')
export class LinkTypeController {
  constructor(
    @Inject(LinkTypeService) private readonly types: LinkTypeService,
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

  /** Modifie un type ; pour un type livré, enregistre d'abord sa version de l'organisation. */
  @Roles('athena-admin')
  @Put(':key')
  @BodySchema(LinkTypeInput)
  async update(@Req() request: AuthedRequest, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.types.update(organizationId, key, parseBody(LinkTypeInput, body), actor);
    return { key };
  }

  /** Supprime un type de l'organisation, ou rétablit un type livré modifié ; refusé s'il porte des liens. */
  @Roles('athena-admin')
  @HttpCode(204)
  @Delete(':key')
  async remove(@Req() request: AuthedRequest, @Param('key') key: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.types.remove(organizationId, key, actor);
  }
}
