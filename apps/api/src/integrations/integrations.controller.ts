import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, Headers, HttpCode, HttpException, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Pool } from 'pg';
import { z } from 'zod';
import { Public, Roles, type AuthedRequest } from '../auth/auth.guard';
import { BASELINES, PG_POOL, REBUILD, REVERSE_SYNC, SECRET_STORE } from '../core/core.tokens';
import type { RebuildService } from '../history/rebuild';
import type { PushPayload, ReverseSync } from '../history/reverse-sync';
import type { BaselineService } from '../history/baseline.service';
import { Db } from '../core/db';
import { forbidden } from '../core/errors';
import { OrgResolver, parseBody } from '../core/http';
import { AutomationService } from '../automation/automation.service';
import { InboundService } from '../inbound/inbound.service';
import { DocLinkService } from '../docs/doc-link.service';
import { GitCodeService, type GitLabEvent } from '../gitcode/gitcode.service';
import { WebhookService, type SecretStore } from '../webhooks/webhook.service';

const WebhookBody = z.object({
  url: z.string().url().max(2000),
  eventTypes: z.array(z.string().max(60)).min(1).max(50),
  description: z.string().max(500).optional(),
});
const IndexBody = z.object({
  files: z.array(z.object({ path: z.string().max(500), content: z.string() })).min(1).max(500),
  gitSha: z.string().regex(/^[0-9a-f]{7,40}$/).nullable().optional(),
});
const DocLinkBody = z.object({ source: z.string().min(1), uid: z.string().min(1).max(200) });
const GitlabEvents = new Set(['push', 'merge_request', 'pipeline']);

const digest = (value: string) => createHash('sha256').update(value).digest();
export const historySecretPath = (organizationId: string, project: string) => `athena/${organizationId}/history-hook/${project}`;
export const gitlabSecretPath = (organizationId: string, project: string) => `athena/${organizationId}/gitlab-hook/${project}`;

@Controller()
export class IntegrationsController {
  constructor(
    private readonly orgs: OrgResolver,
    private readonly db: Db,
    private readonly webhooks: WebhookService,
    private readonly docs: DocLinkService,
    private readonly gitCode: GitCodeService,
    @Inject(SECRET_STORE) private readonly secrets: SecretStore,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(BASELINES) private readonly baselines: BaselineService | null,
    @Inject(REVERSE_SYNC) private readonly reverse: ReverseSync | null,
    @Inject(REBUILD) private readonly rebuilder: RebuildService | null,
    private readonly automation: AutomationService,
    private readonly inbound: InboundService,
  ) {}

  private baselineService(): BaselineService {
    if (!this.baselines) throw new HttpException({ error: 'unavailable', message: 'Historique GitLab non configuré.', details: [] }, 503);
    return this.baselines;
  }

  private ctx = (request: AuthedRequest) => this.orgs.resolve(request.principal!);

  // --- Webhooks sortants ---
  @Roles('athena-admin')
  @Post('v1/webhooks')
  async createWebhook(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    return this.webhooks.createEndpoint(organizationId, parseBody(WebhookBody, body), actor);
  }

  @Roles('athena-admin')
  @Get('v1/webhooks')
  async listWebhooks(@Req() request: AuthedRequest) {
    return this.webhooks.listEndpoints((await this.ctx(request)).organizationId);
  }

  @Roles('athena-admin')
  @Get('v1/webhooks/:id/deliveries')
  async deliveries(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.webhooks.deliveries((await this.ctx(request)).organizationId, id);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Post('v1/webhooks/deliveries/:id/replay')
  async replay(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.ctx(request);
    await this.webhooks.replay(organizationId, id, actor);
  }

  // --- Documentation StrictDoc ---
  @Roles('athena-admin')
  @Post('v1/projects/:project/docs/:source/index')
  async indexDocs(@Req() request: AuthedRequest, @Param('project') project: string, @Param('source') source: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(IndexBody, body);
    return this.docs.index(organizationId, project, source, input.files, input.gitSha ?? null, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Post('v1/projects/:project/artifacts/:key/doc-links')
  @HttpCode(204)
  async docLink(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(DocLinkBody, body);
    await this.docs.link(organizationId, project, key, input.source, input.uid, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Get('v1/projects/:project/artifacts/:key/doc-links')
  async docLinks(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    return this.docs.links((await this.ctx(request)).organizationId, project, key);
  }

  @Roles('athena-user', 'athena-admin')
  @Get('v1/projects/:project/docs/:source/coverage')
  async coverage(@Req() request: AuthedRequest, @Param('project') project: string, @Param('source') source: string, @Query('tracker') tracker = 'REQ') {
    return this.docs.coverage((await this.ctx(request)).organizationId, project, source, tracker);
  }

  // --- Historique GitLab : synchronisation inverse et reconstruction ---
  @Roles('athena-admin')
  @Post('v1/projects/:project/integrations/history')
  async historyIntegration(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId } = await this.ctx(request);
    const secret = `glhook_${randomBytes(32).toString('hex')}`;
    await this.secrets.put(historySecretPath(organizationId, project), { secret });
    const org = (await this.db.tx(organizationId, (c) => c.query('select key from organization'))).rows[0].key as string;
    return { path: `/hooks/in/history/${org}/${project}`, secret };
  }

  /** Webhook push du dépôt d'historique : importe les commits faits directement dans GitLab. */
  @Public()
  @HttpCode(202)
  @Post('hooks/in/history/:org/:project')
  async receiveHistory(
    @Param('org') orgKey: string, @Param('project') project: string,
    @Headers('x-gitlab-token') token: string | undefined, @Body() body: unknown,
  ) {
    const denied = () => forbidden('Authentification du webhook refusée.');
    if (!token || !/^[a-z0-9][a-z0-9-]{1,38}$/.test(orgKey) || !/^[A-Z][A-Z0-9]{1,9}$/.test(project)) throw denied();
    const row = (await this.pool.query('select organization_id_by_key($1) as id', [orgKey])).rows[0];
    const organizationId = row?.id as string | undefined;
    const expected = organizationId ? (await this.secrets.get(historySecretPath(organizationId, project)))?.['secret'] : undefined;
    if (!expected || !timingSafeEqual(digest(token), digest(expected))) throw denied();
    if (!this.reverse) throw new HttpException({ error: 'unavailable', message: 'Historique GitLab non configuré.', details: [] }, 503);
    const payload = body as { object_kind?: string; commits?: PushPayload['commits'] };
    if (payload?.object_kind !== 'push') return { accepted: false, reason: 'événement ignoré' };
    return { accepted: true, results: await this.reverse.handlePush(organizationId!, project, { commits: (payload.commits ?? []).slice(0, 100) }) };
  }

  /** Reconstruit un projet VIDE depuis le dépôt d'historique (reprise après sinistre). */
  @Roles('athena-admin')
  @Post('v1/projects/:project/rebuild')
  async rebuild(@Req() request: AuthedRequest, @Param('project') project: string) {
    if (!this.rebuilder) throw new HttpException({ error: 'unavailable', message: 'Historique GitLab non configuré.', details: [] }, 503);
    const { organizationId, actor } = await this.ctx(request);
    const org = (await this.db.tx(organizationId, (c) => c.query('select key from organization'))).rows[0].key as string;
    return this.rebuilder.rebuild(organizationId, project, org, actor.id);
  }

  // --- Automatisations ---
  @Roles('athena-admin')
  @Post('v1/projects/:project/automations')
  async createRule(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    return { id: await this.automation.createRule(organizationId, project, body, actor) };
  }

  @Roles('athena-user', 'athena-admin')
  @Get('v1/projects/:project/automations')
  async listRules(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.automation.list((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Post('v1/automations/:id/:state')
  async toggleRule(@Req() request: AuthedRequest, @Param('id') id: string, @Param('state') state: string) {
    const { organizationId, actor } = await this.ctx(request);
    if (state !== 'enable' && state !== 'disable') throw forbidden('Action inconnue.');
    await this.automation.setEnabled(organizationId, id, state === 'enable', actor);
  }

  @Roles('athena-admin')
  @Get('v1/automations/:id/runs')
  async ruleRuns(@Req() request: AuthedRequest, @Param('id') id: string) {
    return this.automation.runs((await this.ctx(request)).organizationId, id);
  }

  // --- Webhooks entrants génériques ---
  @Roles('athena-admin')
  @Post('v1/projects/:project/inbound-sources')
  async createInbound(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(z.object({ name: z.string().min(2).max(40), mapping: z.unknown() }), body);
    return this.inbound.createSource(organizationId, project, input.name, input.mapping, actor);
  }

  /** Réception d'une charge utile externe : signature HMAC sur le corps brut, idempotence, mappage déclaratif. */
  @Public()
  @HttpCode(202)
  @Post('hooks/in/source/:org/:project/:name')
  async receiveInbound(
    @Param('org') orgKey: string, @Param('project') project: string, @Param('name') name: string,
    @Headers('athena-signature') signature: string | undefined, @Headers('idempotency-key') idempotency: string | undefined,
    @Req() request: { rawBody?: Buffer },
  ) {
    const denied = () => forbidden('Authentification du webhook refusée.');
    if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(orgKey) || !/^[A-Z][A-Z0-9]{1,9}$/.test(project) || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(name) || !Buffer.isBuffer(request.rawBody)) throw denied();
    const row = (await this.pool.query('select organization_id_by_key($1) as id', [orgKey])).rows[0];
    if (!row?.id) throw denied();
    return this.inbound.handle(row.id as string, project, name, request.rawBody.toString('utf8'), signature, idempotency);
  }

  // --- Baselines ---
  @Roles('athena-admin')
  @Post('v1/projects/:project/baselines')
  async createBaseline(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    return this.baselineService().create(organizationId, project, parseBody(z.object({ name: z.string().min(1).max(61) }), body).name, actor);
  }

  @Roles('athena-user', 'athena-admin')
  @Get('v1/projects/:project/baselines')
  async listBaselines(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.baselineService().list((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-user', 'athena-admin')
  @Get('v1/projects/:project/baselines-diff')
  async diffBaselines(@Req() request: AuthedRequest, @Param('project') project: string, @Query('from') from = '', @Query('to') to = '') {
    return this.baselineService().diff((await this.ctx(request)).organizationId, project, from, to);
  }

  // --- Code GitLab ---
  @Roles('athena-user', 'athena-admin')
  @Get('v1/projects/:project/artifacts/:key/code-refs')
  async codeRefs(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    return this.gitCode.refs((await this.ctx(request)).organizationId, project, key);
  }

  /** Crée (ou fait tourner) le secret du webhook GitLab d'un projet. Affiché une seule fois. */
  @Roles('athena-admin')
  @Post('v1/projects/:project/integrations/gitlab')
  async gitlabIntegration(@Req() request: AuthedRequest, @Param('project') project: string) {
    const { organizationId } = await this.ctx(request);
    const secret = `glhook_${randomBytes(32).toString('hex')}`;
    await this.secrets.put(gitlabSecretPath(organizationId, project), { secret });
    const org = (await this.db.tx(organizationId, (c) => c.query('select key from organization'))).rows[0].key as string;
    return { path: `/hooks/in/gitlab/${org}/${project}`, secret };
  }

  /**
   * Réception des webhooks GitLab. Authentifié par le jeton secret (comparaison en temps constant),
   * toute erreur d'authentification donne la même réponse 401 (pas d'énumération d'organisations).
   */
  @Public()
  @HttpCode(202)
  @Post('hooks/in/gitlab/:org/:project')
  async receiveGitlab(
    @Param('org') orgKey: string, @Param('project') project: string,
    @Headers('x-gitlab-token') token: string | undefined, @Body() body: unknown,
  ) {
    const denied = () => forbidden('Authentification du webhook refusée.');
    if (!token || !/^[a-z0-9][a-z0-9-]{1,38}$/.test(orgKey) || !/^[A-Z][A-Z0-9]{1,9}$/.test(project)) throw denied();
    const row = (await this.pool.query('select organization_id_by_key($1) as id', [orgKey])).rows[0];
    const organizationId = row?.id as string | undefined;
    const expected = organizationId ? (await this.secrets.get(gitlabSecretPath(organizationId, project)))?.['secret'] : undefined;
    const given = digest(token);
    const wanted = digest(expected ?? randomBytes(16).toString('hex'));
    if (!expected || !timingSafeEqual(given, wanted)) throw denied();

    const event = body as { object_kind?: string };
    if (!event?.object_kind || !GitlabEvents.has(event.object_kind)) return { accepted: false, reason: 'événement ignoré' };
    const results = await this.gitCode.handle(organizationId!, project, event as GitLabEvent);
    return { accepted: true, results };
  }
}
