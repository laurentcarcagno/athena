import { Body, Controller, Get, HttpCode, Inject, Post, Put, Req } from '@nestjs/common';
import { z } from 'zod';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { OrgResolver, parseBody } from './http';
import { PinEntry, PinService } from './pin.service';

const FavoriteBody = PinEntry.extend({ favorite: z.boolean() });
const OrderBody = z.object({ ids: z.array(z.string().uuid()).max(100) });

/** Favoris et récents de l'utilisateur courant (rail latéral). */
@Controller('v1/me/pins')
export class PinController {
  constructor(
    @Inject(PinService) private readonly pins: PinService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-team-member', 'athena-admin')
  @Get()
  async list(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.pins.list(organizationId, actor.id);
  }

  @Roles('athena-team-member', 'athena-admin')
  @HttpCode(204)
  @Post('visit')
  @BodySchema(PinEntry)
  async visit(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.pins.visit(organizationId, actor.id, parseBody(PinEntry, body));
  }

  @Roles('athena-team-member', 'athena-admin')
  @HttpCode(204)
  @Put('favorite')
  @BodySchema(FavoriteBody)
  async favorite(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const { favorite, ...entry } = parseBody(FavoriteBody, body);
    await this.pins.setFavorite(organizationId, actor.id, entry, favorite);
  }

  @Roles('athena-team-member', 'athena-admin')
  @HttpCode(204)
  @Put('order')
  @BodySchema(OrderBody)
  async order(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.pins.reorder(organizationId, actor.id, parseBody(OrderBody, body).ids);
  }
}
