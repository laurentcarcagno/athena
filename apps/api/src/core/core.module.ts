import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Pool } from 'pg';
import { loadConfig } from '../config';
import { PluginService } from '../plugins/plugin.service';
import { parseTrust } from '../plugins/trust';
import { CodeActions } from '../gitcode/code-actions';
import { DocFetcher } from '../docs/doc-fetch';
import { AutomationService } from '../automation/automation.service';
import { InboundService } from '../inbound/inbound.service';
import { AgileController } from '../agile/agile.controller';
import { BoardService } from '../agile/board.service';
import { SprintService } from '../agile/sprint.service';
import { DocLinkService } from '../docs/doc-link.service';
import { GitCodeService } from '../gitcode/gitcode.service';
import { IntegrationsController } from '../integrations/integrations.controller';
import { OpenBao } from '../secrets/openbao';
import { OpenBaoSecretStore, UnavailableSecretStore } from '../secrets/store';
import { WebhookService, type SecretStore } from '../webhooks/webhook.service';
import { BaselineService } from '../history/baseline.service';
import { GitLabClient } from '../history/gitlab-client';
import { RebuildService } from '../history/rebuild';
import { ReverseSync } from '../history/reverse-sync';
import { BASELINES, PLUGINS, CODE_ACTIONS, DOC_FETCHER, PG_POOL, REBUILD, REVERSE_SYNC, SECRET_STORE } from './core.tokens';
import { ArtifactService } from './artifact.service';
import { CoreController } from './core.controller';
import { Db } from './db';
import { FieldTypeRegistry } from './field-types';
import { SearchService } from '../atql/search.service';
import { LinkService } from './link.service';
import { DomainErrorFilter, OrgResolver } from './http';
import { TrackerService } from './tracker.service';

export { PG_POOL } from './core.tokens';

@Module({
  controllers: [CoreController, IntegrationsController, AgileController],
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
    { provide: LinkService, useFactory: (db: Db) => new LinkService(db), inject: [Db] },
    { provide: SearchService, useFactory: (db: Db) => new SearchService(db), inject: [Db] },
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
    { provide: GitCodeService, useFactory: (db: Db, a: ArtifactService) => new GitCodeService(db, a), inject: [Db, ArtifactService] },
    { provide: BoardService, useFactory: (db: Db, t: TrackerService, a: ArtifactService) => new BoardService(db, t, a), inject: [Db, TrackerService, ArtifactService] },
    { provide: SprintService, useFactory: (db: Db) => new SprintService(db), inject: [Db] },
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
        return c.GITLAB_URL && c.GITLAB_TOKEN && c.GITLAB_NAMESPACE ? new ReverseSync(pool, new GitLabClient(c.GITLAB_URL, c.GITLAB_TOKEN), c.GITLAB_NAMESPACE, a) : null;
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
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
  exports: [FieldTypeRegistry, PG_POOL],
})
export class CoreModule {}
