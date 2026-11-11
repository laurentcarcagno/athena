import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Pool } from 'pg';
import { loadConfig } from '../config';
import { PluginService } from '../plugins/plugin.service';
import { parseTrust } from '../plugins/trust';
import { ImportService } from '../import/import.service';
import { DeliveryService } from '../gitcode/delivery';
import { CodeActions } from '../gitcode/code-actions';
import { DocFetcher } from '../docs/doc-fetch';
import { DocWriteback } from '../docs/doc-writeback';
import { AutomationService } from '../automation/automation.service';
import { InboundService } from '../inbound/inbound.service';
import { AgileController } from '../agile/agile.controller';
import { BoardService } from '../agile/board.service';
import { ReportService } from '../agile/report.service';
import { SprintService } from '../agile/sprint.service';
import { BacklogService } from '../agile/backlog.service';
import { DocController } from '../docs/doc.controller';
import { DocLinkService } from '../docs/doc-link.service';
import { DocReadService } from '../docs/doc-read.service';
import { GitCodeService } from '../gitcode/gitcode.service';
import { IntegrationsController } from '../integrations/integrations.controller';
import { OpenBao } from '../secrets/openbao';
import { OpenBaoSecretStore, UnavailableSecretStore } from '../secrets/store';
import { WebhookService, type SecretStore } from '../webhooks/webhook.service';
import { BaselineService } from '../history/baseline.service';
import { GitLabClient } from '../history/gitlab-client';
import { RebuildService } from '../history/rebuild';
import { ReverseSync } from '../history/reverse-sync';
import { BASELINES, PLUGINS, CODE_ACTIONS, DOC_FETCHER, DOC_WRITEBACK, PG_POOL, REBUILD, REVERSE_SYNC, SECRET_STORE } from './core.tokens';
import { ArtifactService } from './artifact.service';
import { CoreController } from './core.controller';
import { Db } from './db';
import { FieldTypeRegistry } from './field-types';
import { SearchService } from '../atql/search.service';
import { DashboardController } from './dashboard.controller';
import { AppearanceController } from './appearance.controller';
import { AppearanceService } from './appearance.service';
import { PreferenceController } from './preference.controller';
import { PreferenceService } from './preference.service';
import { DashboardService } from './dashboard.service';
import { SavedSearchService } from '../atql/saved-search.service';
import { AttachmentController } from './attachment.controller';
import { AttachmentService, DEFAULT_QUOTA } from './attachment.service';
import { ClamAvScanner } from '../storage/clamav';
import { S3Client } from '../storage/s3';
import { SavedFilterController } from '../atql/saved-filter.controller';
import { SearchController } from '../atql/search.controller';
import { SavedFilterService } from '../atql/saved-filter.service';
import { LinkService } from './link.service';
import { NotifyController } from '../notify/notify.controller';
import { NotifyService } from '../notify/notify.service';
import { DigestService } from '../notify/digest';
import { mailerFrom } from '../notify/mailer-config';
import { MemberController } from './member.controller';
import { AccessController } from './access.controller';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { ItemApprovalController } from './item-approval.controller';
import { ItemApprovalService } from './item-approval.service';
import { AccessService } from './access.service';
import { ExportMarker } from './export-marking';
import { NormativeController } from './normative.controller';
import { NormativeService } from './normative.service';
import { ProjectTemplateController, TemplateController, TrackerTemplateController } from './template.controller';
import { TemplateUpgradeService } from './template-upgrade.service';
import { ProjectOverviewController } from './project-overview.controller';
import { ProjectOverviewService } from './project-overview.service';
import { LinkTypeController } from './link-type.controller';
import { LinkTypeService } from './link-type.service';
import { CoverageController } from './coverage.controller';
import { CoverageService } from './coverage.service';
import { MatrixController } from './matrix.controller';
import { MatrixService } from './matrix.service';
import { PinController } from './pin.controller';
import { TreeController } from './tree.controller';
import { TreeService } from './tree.service';
import { PinService } from './pin.service';
import { TrackerTypeController } from './tracker-type.controller';
import { TrackerTypeService } from './tracker-type.service';
import { TemplateService } from './template.service';
import { MemberService } from './member.service';
import { DomainErrorFilter, OrgResolver } from './http';
import { TrackerService } from './tracker.service';

export { PG_POOL } from './core.tokens';

@Module({
  controllers: [CoreController, AttachmentController, SavedFilterController, SearchController, IntegrationsController, AgileController, MemberController, TemplateController, ProjectTemplateController, TrackerTemplateController, TrackerTypeController, ProjectOverviewController, PinController, LinkTypeController, TreeController, MatrixController, CoverageController, NormativeController, AccessController, ApprovalController, ItemApprovalController, DocController, NotifyController, DashboardController, PreferenceController, AppearanceController],
  providers: [
    { provide: PG_POOL, useFactory: () => new Pool({ connectionString: loadConfig().DATABASE_URL, max: 10 }) },
    { provide: FieldTypeRegistry, useValue: new FieldTypeRegistry() },
    { provide: Db, useFactory: (pool: Pool) => new Db(pool), inject: [PG_POOL] },
    { provide: OrgResolver, useFactory: (pool: Pool) => new OrgResolver(pool), inject: [PG_POOL] },
    { provide: TrackerService, useFactory: (db: Db, f: FieldTypeRegistry) => new TrackerService(db, f), inject: [Db, FieldTypeRegistry] },
    {
      provide: ArtifactService,
      useFactory: (db: Db, t: TrackerService, f: FieldTypeRegistry) => new ArtifactService(db, t, f),
      inject: [Db, TrackerService, FieldTypeRegistry],
    },
    {
      provide: AttachmentService,
      useFactory: (db: Db): AttachmentService => {
        const c = loadConfig();
        if (!c.S3_ENDPOINT || !c.S3_ACCESS_KEY || !c.S3_SECRET_KEY) {
          return new AttachmentService(db, new (class extends S3Client { override async put(): Promise<void> { throw new Error('Stockage S3 non configuré'); } })({ endpoint: 'http://localhost', region: '', accessKey: '', secretKey: '', bucket: 'x' }));
        }
        const s3 = new S3Client({ endpoint: c.S3_ENDPOINT, region: c.S3_REGION, accessKey: c.S3_ACCESS_KEY, secretKey: c.S3_SECRET_KEY, bucket: c.S3_BUCKET });
        void s3.ensureBucket().catch((e: Error) => console.error(`s3: ${e.message}`));
        return new AttachmentService(db, s3, DEFAULT_QUOTA, c.CLAMAV_HOST ? new ClamAvScanner(c.CLAMAV_HOST, c.CLAMAV_PORT) : undefined);
      },
      inject: [Db],
    },
    { provide: LinkService, useFactory: (db: Db) => new LinkService(db), inject: [Db] },
    { provide: SavedFilterService, useFactory: (db: Db) => new SavedFilterService(db), inject: [Db] },
    { provide: SearchService, useFactory: (db: Db) => new SearchService(db), inject: [Db] },
    { provide: PreferenceService, useFactory: (db: Db) => new PreferenceService(db), inject: [Db] },
    { provide: AppearanceService, useFactory: (db: Db) => new AppearanceService(db), inject: [Db] },
    { provide: DashboardService, useFactory: (db: Db) => new DashboardService(db), inject: [Db] },
    { provide: SavedSearchService, useFactory: (db: Db) => new SavedSearchService(db), inject: [Db] },
    {
      provide: SECRET_STORE,
      useFactory: (): SecretStore => {
        const config = loadConfig();
        return config.OPENBAO_ADDR && config.OPENBAO_TOKEN
          ? new OpenBaoSecretStore(new OpenBao(config.OPENBAO_ADDR, config.OPENBAO_TOKEN))
          : new UnavailableSecretStore();
      },
    },
    {
      provide: WebhookService,
      useFactory: (pool: Pool, secrets: SecretStore) => new WebhookService(pool, secrets, { allowPrivate: loadConfig().WEBHOOK_ALLOW_PRIVATE }),
      inject: [PG_POOL, SECRET_STORE],
    },
    { provide: DocLinkService, useFactory: (db: Db) => new DocLinkService(db), inject: [Db] },
    { provide: DocReadService, useFactory: (db: Db) => new DocReadService(db, loadConfig().GITLAB_URL), inject: [Db] },
    { provide: GitCodeService, useFactory: (db: Db, a: ArtifactService) => new GitCodeService(db, a), inject: [Db, ArtifactService] },
    { provide: BoardService, useFactory: (db: Db, t: TrackerService, a: ArtifactService) => new BoardService(db, t, a), inject: [Db, TrackerService, ArtifactService] },
    { provide: ReportService, useFactory: (db: Db) => new ReportService(db), inject: [Db] },
    { provide: ProjectOverviewService, useFactory: (db: Db) => new ProjectOverviewService(db), inject: [Db] },
    { provide: LinkTypeService, useFactory: (db: Db) => new LinkTypeService(db), inject: [Db] },
    { provide: TreeService, useFactory: (db: Db) => new TreeService(db), inject: [Db] },
    { provide: CoverageService, useFactory: (db: Db) => new CoverageService(db), inject: [Db] },
    { provide: MatrixService, useFactory: (db: Db) => new MatrixService(db), inject: [Db] },
    { provide: PinService, useFactory: (db: Db) => new PinService(db), inject: [Db] },
    { provide: TrackerTypeService, useFactory: (db: Db) => new TrackerTypeService(db), inject: [Db] },
    { provide: TemplateService, useFactory: (db: Db, t: TrackerService) => new TemplateService(db, t), inject: [Db, TrackerService] },
    { provide: TemplateUpgradeService, useFactory: (db: Db, t: TrackerService, tpl: TemplateService) => new TemplateUpgradeService(db, t, tpl), inject: [Db, TrackerService, TemplateService] },
    { provide: ExportMarker, useFactory: () => new ExportMarker(loadConfig().ATHENA_PROTECTION_LEVEL), inject: [] },
    { provide: NotifyService, useFactory: (db: Db) => new NotifyService(db), inject: [Db] },
    {
      provide: DigestService,
      useFactory: (db: Db): DigestService => {
        const c = loadConfig();
        return new DigestService(db, { mailer: null, baseUrl: c.PUBLIC_URL, available: mailerFrom(c) !== null }); // l'API ne poste pas : le worker envoie
      },
      inject: [Db],
    },
    { provide: ApprovalService, useFactory: (db: Db) => new ApprovalService(db), inject: [Db] },
    { provide: ItemApprovalService, useFactory: (db: Db) => new ItemApprovalService(db), inject: [Db] },
    { provide: AccessService, useFactory: (db: Db) => new AccessService(db), inject: [Db] },
    { provide: NormativeService, useFactory: (db: Db, a: ArtifactService) => new NormativeService(db, a), inject: [Db, ArtifactService] },
    { provide: MemberService, useFactory: (db: Db) => new MemberService(db), inject: [Db] },
    { provide: SprintService, useFactory: (db: Db) => new SprintService(db), inject: [Db] },
    { provide: BacklogService, useFactory: (db: Db) => new BacklogService(db), inject: [Db] },
    {
      provide: BASELINES,
      useFactory: (pool: Pool): BaselineService | null => {
        const c = loadConfig();
        return c.GITLAB_URL && c.GITLAB_TOKEN && c.GITLAB_NAMESPACE ? new BaselineService(pool, new GitLabClient(c.GITLAB_URL, c.GITLAB_TOKEN), c.GITLAB_NAMESPACE) : null;
      },
      inject: [PG_POOL],
    },
    {
      provide: REVERSE_SYNC,
      useFactory: (pool: Pool, a: ArtifactService): ReverseSync | null => {
        const c = loadConfig();
        return c.GITLAB_URL && c.GITLAB_TOKEN && c.GITLAB_NAMESPACE ? new ReverseSync(pool, new GitLabClient(c.GITLAB_URL, c.GITLAB_TOKEN), c.GITLAB_NAMESPACE, a, undefined, 'main', new ExportMarker(c.ATHENA_PROTECTION_LEVEL)) : null;
      },
      inject: [PG_POOL, ArtifactService],
    },
    {
      provide: REBUILD,
      useFactory: (pool: Pool): RebuildService | null => {
        const c = loadConfig();
        return c.GITLAB_URL && c.GITLAB_TOKEN && c.GITLAB_NAMESPACE ? new RebuildService(pool, new GitLabClient(c.GITLAB_URL, c.GITLAB_TOKEN), c.GITLAB_NAMESPACE) : null;
      },
      inject: [PG_POOL],
    },
    { provide: AutomationService, useFactory: (db: Db, a: ArtifactService, l: LinkService, s: SearchService) => new AutomationService(db, a, l, s), inject: [Db, ArtifactService, LinkService, SearchService] },
    { provide: InboundService, useFactory: (db: Db, a: ArtifactService, l: LinkService, secrets: SecretStore) => new InboundService(db, a, l, secrets), inject: [Db, ArtifactService, LinkService, SECRET_STORE] },
    {
      provide: CODE_ACTIONS,
      useFactory: (db: Db): CodeActions | null => {
        const c = loadConfig();
        return c.GITLAB_URL && c.GITLAB_TOKEN ? new CodeActions(db, new GitLabClient(c.GITLAB_URL, c.GITLAB_TOKEN)) : null;
      },
      inject: [Db],
    },
    {
      provide: DOC_WRITEBACK,
      useFactory: (db: Db): DocWriteback | null => {
        const c = loadConfig();
        return c.GITLAB_URL && c.GITLAB_TOKEN ? new DocWriteback(db, new GitLabClient(c.GITLAB_URL, c.GITLAB_TOKEN)) : null;
      },
      inject: [Db],
    },
    {
      provide: DOC_FETCHER,
      useFactory: (docs: DocLinkService): DocFetcher | null => {
        const c = loadConfig();
        return c.GITLAB_URL && c.GITLAB_TOKEN ? new DocFetcher(new GitLabClient(c.GITLAB_URL, c.GITLAB_TOKEN), docs) : null;
      },
      inject: [DocLinkService],
    },
    {
      provide: PLUGINS,
      useFactory: async (db: Db, registry: FieldTypeRegistry, artifacts: ArtifactService, pool: Pool): Promise<PluginService> => {
        const service = new PluginService(db, registry, parseTrust(loadConfig().PLUGIN_TRUSTED_KEYS), {
          read: async (org, ref) => {
            const [project, key] = ref.split('/');
            if (!project || !key) return null;
            return artifacts.get(org, project, key).catch(() => null);
          },
        });
        // Démarre les plugins déjà installés pour que leurs types de champ soient disponibles dès le premier appel.
        try {
          const orgs = (await pool.query('select list_organization_ids() as id')).rows as Array<{ id: string }>;
          for (const { id } of orgs) await service.loadEnabled(id);
        } catch (error) {
          console.error(`plugins: chargement initial impossible : ${(error as Error).message.slice(0, 150)}`);
        }
        return service;
      },
      inject: [Db, FieldTypeRegistry, ArtifactService, PG_POOL],
    },
    { provide: ImportService, useFactory: (db: Db, t: TrackerService, f: FieldTypeRegistry) => new ImportService(db, t, f), inject: [Db, TrackerService, FieldTypeRegistry] },
    { provide: DeliveryService, useFactory: (db: Db) => new DeliveryService(db), inject: [Db] },
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
  exports: [FieldTypeRegistry, PG_POOL],
})
export class CoreModule {}
