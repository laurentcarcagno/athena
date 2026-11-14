import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver, parseBody } from '../core/http';
import { validation } from '../core/errors';
import { BodySchema } from '../openapi/body-schema';
import { DigestInput, DigestService } from './digest';
import { NOTIFY_EVENTS, NotifyService, PrefInput, ReadInput, SubscribeInput, type NotifyEvent } from './notify.service';

/**
 * Notifications, abonnements et réglages de la personne connectée. Ce sont des données personnelles, pas des données de projet :
 * l'assurance qualité étatique (lecture seule ailleurs) peut y marquer ses notifications lues et gérer ses abonnements.
 */
const ME = ['athena-team-member', 'athena-admin', 'athena-qa'] as const;

@Controller('v1')
export class NotifyController {
  constructor(
    @Inject(NotifyService) private readonly notify: NotifyService,
    @Inject(DigestService) private readonly digest: DigestService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles(...ME)
  @Get('me/notifications')
  async list(@Req() request: AuthedRequest, @Query('unread') unread?: string, @Query('limit') limit?: string, @Query('event') event?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    const n = limit === undefined ? undefined : Number(limit);
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 200)) throw validation(['limit : entre 1 et 200']);
    if (event !== undefined && !(NOTIFY_EVENTS as readonly string[]).includes(event)) throw validation([`événement inconnu : ${event}`]);
    return this.notify.list(organizationId, actor.id, { unread: unread === '1' || unread === 'true', ...(n !== undefined ? { limit: n } : {}), ...(event ? { event: event as NotifyEvent } : {}) });
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

  /** Résumé quotidien par courriel : réglage de la personne ; `available` est faux quand l'instance n'a pas de SMTP (réseau isolé). */
  @Roles(...ME)
  @Get('me/notification-digest')
  async digestSettings(@Req() request: AuthedRequest) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.digest.settings(organizationId, actor.id);
  }

  @Roles(...ME)
  @Put('me/notification-digest')
  @BodySchema(DigestInput)
  async setDigest(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.digest.setSettings(organizationId, actor.id, parseBody(DigestInput, body));
  }

  /** Autocomplétion des mentions : seules les personnes qui peuvent lire l'item sont proposées. */
  @Roles('athena-team-member', 'athena-admin')
  @Get('projects/:project/artifacts/:key/mentionable')
  async mentionable(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Query('q') q?: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.notify.mentionable(organizationId, actor.id, project, key, (q ?? '').slice(0, 64));
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
