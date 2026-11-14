import { ExportMarker } from '../core/export-marking';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Delete, Get, Headers, HttpCode, HttpException, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { Pool } from 'pg';
import { z } from 'zod';
import { BodySchema } from '../openapi/body-schema';
import { ArtifactService } from '../core/artifact.service';
import { Public, Roles, type AuthedRequest } from '../auth/auth.guard';
import { MemberService } from '../core/member.service';
import { BASELINES, PLUGINS, CODE_ACTIONS, DOC_FETCHER, DOC_WRITEBACK, PG_POOL, REBUILD, REVERSE_SYNC, SECRET_STORE } from '../core/core.tokens';
import type { RebuildService } from '../history/rebuild';
import type { PushPayload, ReverseSync } from '../history/reverse-sync';
import type { BaselineService } from '../history/baseline.service';
import { Db } from '../core/db';
import { FieldTypeRegistry } from '../core/field-types';
import { forbidden, validation } from '../core/errors';
import { OrgResolver, parseBody } from '../core/http';
import { ImportService } from '../import/import.service';
import { JiraConfigSchema, parseJiraCsv, parseTuleapArtifacts, TuleapConfigSchema, type ImportRecord } from '../import/sources';
import type { PluginService } from '../plugins/plugin.service';
import { DeliveryService } from '../gitcode/delivery';
import type { CodeActions } from '../gitcode/code-actions';
import type { DocFetcher } from '../docs/doc-fetch';
import type { DocWriteback } from '../docs/doc-writeback';
import { AutomationService } from '../automation/automation.service';
import { InboundService } from '../inbound/inbound.service';
import { DocLinkService } from '../docs/doc-link.service';
import { GitCodeService, type GitLabEvent } from '../gitcode/gitcode.service';
import { WebhookService, type SecretStore } from '../webhooks/webhook.service';

const WebhookBody = z.object({
  url: z.string().url().max(2000),
  eventTypes: z.array(z.string().max(60)).min(1).max(50),
  description: z.string().max(500).optional(),
  /** Abonnement habilité à recevoir les événements des items sous contrôle export (faux par défaut : ils ne lui sont pas envoyés). */
  exportControlOk: z.boolean().optional(),
});
const IndexBody = z.object({
  files: z.array(z.object({ path: z.string().max(500), content: z.string() })).min(1).max(500),
  gitSha: z.string().regex(/^[0-9a-f]{7,40}$/).nullable().optional(),
});
const DocLinkBody = z.object({ source: z.string().min(1), uid: z.string().min(1).max(200) });
const GitlabEvents = new Set(['push', 'merge_request', 'pipeline', 'deployment']);

const digest = (value: string) => createHash('sha256').update(value).digest();
export const historySecretPath = (organizationId: string, project: string) => `athena/${organizationId}/history-hook/${project}`;
export const gitlabSecretPath = (organizationId: string, project: string) => `athena/${organizationId}/gitlab-hook/${project}`;

const CreateInboundBody = z.object({ name: z.string().min(2).max(40), mapping: z.unknown() });
const AddCodeRepoBody = z.object({ path: z.string().min(1).max(200), defaultBranch: z.string().max(100).default('main') });
const CreateBranchBody = z.object({ type: z.enum(['bugfix', 'feature']), repo: z.string().max(200).optional() });
const CreateMergeRequestBody = z.object({ branch: z.string().min(1).max(200), repo: z.string().max(200).optional() });
const SyncDocsBody = z.object({ repo: z.string().min(1).max(200), ref: z.string().max(100).default('main'), path: z.string().max(200).optional() });
const WritebackDocsBody = z.object({ repo: z.string().min(1).max(200), ref: z.string().max(100).default('main') });
const InstallPluginBody = z.object({
      package: z.object({ manifest: z.unknown(), code: z.string().max(300_000), signature: z.string().max(200) }),
      granted: z.array(z.enum(['storage', 'artifacts:read'])).max(10).default([]),
    });
const PluginActionBody = z.object({ key: z.string().max(50).optional(), version: z.number().int().optional() });
const PluginConnectorBody = z.object({ payload: z.unknown() });
const ImportDataBody = z.object({
      source: z.enum(['jira', 'tuleap']),
      content: z.unknown(),
      config: z.unknown(),
      statusMap: z.record(z.string(), z.string()),
      dryRun: z.boolean().default(true),
    });
const PlanBackportsBody = z.object({ branches: z.array(z.string().max(80)).min(1).max(20) });
const CancelBackportBody = z.object({ branch: z.string().max(80) });
const CreateBaselineBody = z.object({ name: z.string().min(1).max(61) });
@Controller()
export class IntegrationsController {
  constructor(
    private readonly orgs: OrgResolver,
    private readonly members: MemberService,
    private readonly db: Db,
    private readonly webhooks: WebhookService,
    private readonly docs: DocLinkService,
    private readonly gitCode: GitCodeService,
    @Inject(SECRET_STORE) private readonly secrets: SecretStore,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(BASELINES) private readonly baselines: BaselineService | null,
    private readonly marker: ExportMarker,
    @Inject(REVERSE_SYNC) private readonly reverse: ReverseSync | null,
    @Inject(REBUILD) private readonly rebuilder: RebuildService | null,
    @Inject(CODE_ACTIONS) private readonly code: CodeActions | null,
    @Inject(DOC_FETCHER) private readonly fetcher: DocFetcher | null,
    @Inject(DOC_WRITEBACK) private readonly writeback: DocWriteback | null,
    @Inject(PLUGINS) private readonly plugins: PluginService,
    private readonly artifacts: ArtifactService,
    private readonly fieldTypes: FieldTypeRegistry,
    private readonly delivery: DeliveryService,
    private readonly automation: AutomationService,
    private readonly importer: ImportService,
    private readonly inbound: InboundService,
  ) {}

  private baselineService(): BaselineService {
    if (!this.baselines) throw new HttpException({ error: 'unavailable', message: 'Historique GitLab non configuré.', details: [] }, 503);
    return this.baselines;
  }

  private ctx = (request: AuthedRequest) => this.orgs.resolve(request.principal!);

  // --- Webhooks sortants ---
  @Roles('athena-admin')
  @Post('v1/webhooks')  @BodySchema(WebhookBody)

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
  @Post('v1/projects/:project/docs/:source/index')  @BodySchema(IndexBody)

  async indexDocs(@Req() request: AuthedRequest, @Param('project') project: string, @Param('source') source: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(IndexBody, body);
    return this.docs.index(organizationId, project, source, input.files, input.gitSha ?? null, actor);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Post('v1/projects/:project/artifacts/:key/doc-links')
  @HttpCode(204)  @BodySchema(DocLinkBody)

  async docLink(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(DocLinkBody, body);
    await this.docs.link(organizationId, project, key, input.source, input.uid, actor);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/projects/:project/artifacts/:key/doc-links')
  async docLinks(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    return this.docs.links((await this.ctx(request)).organizationId, project, key);
  }

  @Roles('athena-team-member', 'athena-admin')
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

  /** Renomme dans l'historique les fichiers d'artefacts de l'ancien format de clé (idempotent, un commit). */
  @Roles('athena-admin')
  @HttpCode(200)
  @Post('v1/projects/:project/history/migrate-keys')
  async migrateKeys(@Req() request: AuthedRequest, @Param('project') project: string) {
    if (!this.rebuilder) throw new HttpException({ error: 'unavailable', message: 'Historique GitLab non configuré.', details: [] }, 503);
    const { organizationId } = await this.ctx(request);
    const org = (await this.db.tx(organizationId, (c) => c.query('select key from organization'))).rows[0].key as string;
    return this.rebuilder.migrateKeys(organizationId, project, org);
  }

  // --- Automatisations ---
  @Roles('athena-admin', 'athena-pm')
  @Post('v1/projects/:project/automations')
  async createRule(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    await this.members.requireManager(organizationId, project, actor);
    return { id: await this.automation.createRule(organizationId, project, body, actor) };
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/projects/:project/automations')
  async listRules(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.automation.list((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-admin', 'athena-pm')
  @HttpCode(204)
  @Post('v1/automations/:id/:state')
  async toggleRule(@Req() request: AuthedRequest, @Param('id') id: string, @Param('state') state: string) {
    const { organizationId, actor } = await this.ctx(request);
    await this.members.requireManager(organizationId, await this.automation.projectOf(organizationId, id), actor);
    if (state !== 'enable' && state !== 'disable') throw forbidden('Action inconnue.');
    await this.automation.setEnabled(organizationId, id, state === 'enable', actor);
  }

  @Roles('athena-admin', 'athena-pm')
  @Get('v1/automations/:id/runs')
  async ruleRuns(@Req() request: AuthedRequest, @Param('id') id: string) {
    const { organizationId, actor } = await this.ctx(request);
    await this.members.requireManager(organizationId, await this.automation.projectOf(organizationId, id), actor);
    return this.automation.runs(organizationId, id);
  }

  // --- Webhooks entrants génériques ---
  @Roles('athena-admin')
  @Post('v1/projects/:project/inbound-sources')
  @BodySchema(CreateInboundBody)
  async createInbound(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(CreateInboundBody, body);
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

  // --- Actions vers GitLab : branches, merge requests, documentation ---
  private codeActions(): CodeActions {
    if (!this.code) throw new HttpException({ error: 'unavailable', message: 'GitLab non configuré.', details: [] }, 503);
    return this.code;
  }

  @Roles('athena-admin')
  @Post('v1/projects/:project/code-repos')
  @BodySchema(AddCodeRepoBody)
  async addCodeRepo(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(AddCodeRepoBody, body);
    return this.codeActions().addRepo(organizationId, project, input.path, input.defaultBranch, actor);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/projects/:project/code-repos')
  async codeRepos(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.codeActions().repos((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Post('v1/projects/:project/artifacts/:key/branch')
  @BodySchema(CreateBranchBody)
  async createBranch(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(CreateBranchBody, body);
    return this.codeActions().createBranch(organizationId, project, key, input.type, input.repo, actor);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Post('v1/projects/:project/artifacts/:key/merge-request')
  @BodySchema(CreateMergeRequestBody)
  async createMergeRequest(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(CreateMergeRequestBody, body);
    return this.codeActions().createMergeRequest(organizationId, project, key, input.branch, input.repo, actor);
  }

  @Roles('athena-admin')
  @Post('v1/projects/:project/docs/:source/sync')
  @BodySchema(SyncDocsBody)
  async syncDocs(@Req() request: AuthedRequest, @Param('project') project: string, @Param('source') source: string, @Body() body: unknown) {
    if (!this.fetcher) throw new HttpException({ error: 'unavailable', message: 'GitLab non configuré.', details: [] }, 503);
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(SyncDocsBody, body);
    return this.fetcher.sync(organizationId, project, source, input.repo, input.ref, input.path, actor);
  }

  /** Propose, par merge request, le report des liens Athena dans les fichiers .sdoc (jamais d'écriture directe). */
  @Roles('athena-admin')
  @Post('v1/projects/:project/docs/:source/writeback')
  @BodySchema(WritebackDocsBody)
  async writebackDocs(@Req() request: AuthedRequest, @Param('project') project: string, @Param('source') source: string, @Body() body: unknown) {
    if (!this.writeback) throw new HttpException({ error: 'unavailable', message: 'GitLab non configuré.', details: [] }, 503);
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(WritebackDocsBody, body);
    return this.writeback.proposeRefs(organizationId, project, source, input.repo, input.ref, actor);
  }

  /** Types de champ disponibles (natifs et fournis par des plugins) : alimente l'éditeur de tracker. */
  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/field-types')
  fieldTypeNames() {
    return this.fieldTypes.names();
  }

  // --- Plugins ---
  @Roles('athena-admin')
  @Get('v1/plugins')
  async listPlugins(@Req() request: AuthedRequest) {
    return this.plugins.list((await this.ctx(request)).organizationId);
  }

  @Roles('athena-admin')
  @Post('v1/plugins')
  @BodySchema(InstallPluginBody)
  async installPlugin(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(InstallPluginBody, body);
    const installed = await this.plugins.install(organizationId, { manifest: input.package.manifest, code: input.package.code, signature: input.package.signature }, input.granted, actor);
    await this.plugins.loadEnabled(organizationId);
    return installed;
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Post('v1/plugins/:id/:state')
  async togglePlugin(@Req() request: AuthedRequest, @Param('id') id: string, @Param('state') state: string) {
    const { organizationId, actor } = await this.ctx(request);
    if (state !== 'enable' && state !== 'disable') throw forbidden('Action inconnue.');
    await this.plugins.setEnabled(organizationId, id, state === 'enable', actor);
    if (state === 'enable') await this.plugins.loadEnabled(organizationId);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete('v1/plugins/:id')
  async uninstallPlugin(@Req() request: AuthedRequest, @Param('id') id: string, @Query('keepData') keepData?: string) {
    const { organizationId, actor } = await this.ctx(request);
    await this.plugins.uninstall(organizationId, id, actor, keepData === 'true');
  }

  @Roles('athena-team-member', 'athena-admin')
  @HttpCode(200)
  @Post('v1/plugins/:id/actions/:name')
  @BodySchema(PluginActionBody)
  async pluginAction(@Req() request: AuthedRequest, @Param('id') id: string, @Param('name') name: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(PluginActionBody, body ?? {});
    return { result: await this.plugins.runAction(organizationId, id, name, input, actor) };
  }

  /** Exécute un connecteur sur une charge externe puis crée les artefacts renvoyés, sous l'identité de l'appelant (validation et droits habituels). */
  @Roles('athena-team-member', 'athena-admin')
  @HttpCode(200)
  @Post('v1/projects/:project/plugins/:id/connectors/:name')
  @BodySchema(PluginConnectorBody)
  async pluginConnector(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string, @Param('name') name: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(PluginConnectorBody, body);
    const records = await this.plugins.runConnector(organizationId, id, name, input.payload);
    const created: string[] = [];
    for (const record of records) created.push((await this.artifacts.create(organizationId, project, record.tracker, record.values, actor)).key);
    return { created };
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/widgets')
  async listWidgets(@Req() request: AuthedRequest) {
    return this.plugins.widgets((await this.ctx(request)).organizationId);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/plugins/:id/widgets/:name')
  async pluginWidget(@Req() request: AuthedRequest, @Param('id') id: string, @Param('name') name: string, @Query('project') project = '') {
    const { organizationId } = await this.ctx(request);
    return { model: await this.plugins.widget(organizationId, id, name, project) };
  }

  // --- Import JIRA / Tuleap ---
  /** Simulation par défaut (`dryRun` vrai) : rapport d'écarts sans rien écrire. Limite de corps : 1 Mo, découper les gros exports. */
  @Roles('athena-admin')
  @Post('v1/projects/:project/import')
  @BodySchema(ImportDataBody)
  async importData(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(ImportDataBody, body);
    let parsed: { records: ImportRecord[]; errors: Array<{ row: number; message: string }> };
    try {
      if (input.source === 'jira') {
        parsed = parseJiraCsv(String(input.content ?? ''), JiraConfigSchema.parse(input.config));
      } else {
        parsed = parseTuleapArtifacts(input.content, TuleapConfigSchema.parse(input.config));
      }
    } catch (error) {
      throw validation([(error as Error).message.slice(0, 300)]);
    }
    const report = await this.importer.run(organizationId, project, input.source, parsed.records, { dryRun: input.dryRun, statusMap: input.statusMap }, actor);
    return { ...report, parseErrors: parsed.errors };
  }

  // --- Livraison : rétroportages, DORA, notes de version ---
  @Roles('athena-team-member', 'athena-admin')
  @Post('v1/projects/:project/artifacts/:key/backports')
  @BodySchema(PlanBackportsBody)
  async planBackports(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    const input = parseBody(PlanBackportsBody, body);
    return this.delivery.planBackports(organizationId, project, key, input.branches, actor);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/projects/:project/artifacts/:key/backports')
  async backports(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    return this.delivery.backports((await this.ctx(request)).organizationId, project, key);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Post('v1/projects/:project/artifacts/:key/backports/cancel')
  @BodySchema(CancelBackportBody)
  async cancelBackport(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    await this.delivery.cancelBackport(organizationId, project, key, parseBody(CancelBackportBody, body).branch, actor);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/projects/:project/dora')
  async dora(@Req() request: AuthedRequest, @Param('project') project: string, @Query('days') days = '30', @Query('incident') incident?: string) {
    return this.delivery.dora((await this.ctx(request)).organizationId, project, Number(days), incident && /^[A-Z][A-Z0-9]{1,9}$/.test(incident) ? incident : undefined);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/projects/:project/releases/:id/notes')
  async releaseNotes(@Req() request: AuthedRequest, @Param('project') project: string, @Param('id') id: string) {
    return this.marker.json({ markdown: this.marker.markdown(await this.delivery.releaseNotes((await this.ctx(request)).organizationId, project, id)) });
  }

  // --- Baselines ---
  @Roles('athena-admin', 'athena-pm')
  @Post('v1/projects/:project/baselines')
  @BodySchema(CreateBaselineBody)
  async createBaseline(@Req() request: AuthedRequest, @Param('project') project: string, @Body() body: unknown) {
    const { organizationId, actor } = await this.ctx(request);
    await this.members.requireManager(organizationId, project, actor);
    return this.baselineService().create(organizationId, project, parseBody(CreateBaselineBody, body).name, actor);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/projects/:project/baselines')
  async listBaselines(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.baselineService().list((await this.ctx(request)).organizationId, project);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/projects/:project/baselines-diff')
  async diffBaselines(@Req() request: AuthedRequest, @Param('project') project: string, @Query('from') from = '', @Query('to') to = '') {
    return this.baselineService().diff((await this.ctx(request)).organizationId, project, from, to);
  }

  /** Export CSV d'une comparaison de baselines, avec la mention de protection de l'instance. */
  @Roles('athena-team-member', 'athena-admin')
  @Get('v1/projects/:project/baselines-diff/export')
  async exportBaselineDiff(@Req() request: AuthedRequest, @Param('project') project: string, @Query('from') from = '', @Query('to') to = '') {
    const out = await this.baselineService().diffCsv((await this.ctx(request)).organizationId, project, from, to);
    return this.marker.json({ ...out, csv: this.marker.csv(out.csv) });
  }

  // --- Code GitLab ---
  @Roles('athena-team-member', 'athena-admin')
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
