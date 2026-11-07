import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { validation } from '../core/errors';
import { BodySchema } from '../openapi/body-schema';
import { NOTIFY_EVENTS, NotifyService, PrefInput, ReadInput, SubscribeInput, type NotifyEvent } from './notify.service';

/**
 * Notifications, abonnements et réglages de la personne connectée. Ce sont des données personnelles, pas des données de projet :
 * l'assurance qualité étatique (lecture seule ailleurs) peut y marquer ses notifications lues et gérer ses abonnements.
 */
const ME = ['athena-user', 'athena-admin', 'athena-qa'] as const;

@Controller('v1')
export class NotifyController {
  constructor(
    @Inject(NotifyService) private readonly notify: NotifyService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles(...ME)
  @Get('me/notifications')
  async list(@Req() request: AuthedRequest, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const n = limit === undefined ? undefined : Number(limit);
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 200)) throw validation(['limit : entre 1 et 200']);
    return this.notify.list(organizationId, actor.id, { unread: unread === '1' || unread === 'true', ...(n !== undefined ? { limit: n } : {}) });
  }

  /** Marque des notifications lues (ou non lues avec `read: false`), ou toutes avec `all: true`. */
  @Roles(...ME)
  @Post('me/notifications/read')
  @HttpCode(200)
  @BodySchema(ReadInput)
  async read(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(ReadInput, body);
    return { updated: await this.notify.markRead(organizationId, actor.id, { ...(input.ids ? { ids: input.ids } : {}), ...(input.all ? { all: true } : {}) }, input.read) };
  }

  @Roles(...ME)
  @Get('me/notification-prefs')
  async prefs(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.notify.prefs(organizationId, actor.id);
  }

  @Roles(...ME)
  @Put('me/notification-prefs/:event')
  @BodySchema(PrefInput)
  async setPref(@Req() request: AuthedRequest, @Param('event') event: string, @Body() body: unknown) {
    if (!(NOTIFY_EVENTS as readonly string[]).includes(event)) throw validation([`événement inconnu : ${event}`]);
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const input = parseBody(PrefInput, body);
    await this.notify.setPref(organizationId, actor.id, event as NotifyEvent, input.enabled);
    return { event, enabled: input.enabled };
  }

  @Roles(...ME)
  @Get('projects/:project/subscriptions')
  async subscriptions(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.notify.subscriptions(organizationId, actor.id, project);
  }

  @Roles(...ME)
  @Post('projects/:project/subscriptions')
  @BodySchema(SubscribeInput)
  async subscribe(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.notify.subscribe(organizationId, actor.id, project, parseBody(SubscribeInput, body));
  }

  @Roles(...ME)
  @Delete('subscriptions/:id')
  @HttpCode(204)
  async unsubscribe(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.notify.unsubscribe(organizationId, actor.id, id);
  }
}
