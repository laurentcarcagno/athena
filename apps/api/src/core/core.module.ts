import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Pool } from 'pg';
import { loadConfig } from '../config';
import { AgileController } from '../agile/agile.controller';
import { BoardService } from '../agile/board.service';
import { SprintService } from '../agile/sprint.service';
import { DocLinkService } from '../docs/doc-link.service';
import { GitCodeService } from '../gitcode/gitcode.service';
import { IntegrationsController } from '../integrations/integrations.controller';
import { OpenBao } from '../secrets/openbao';
import { OpenBaoSecretStore, UnavailableSecretStore } from '../secrets/store';
import { WebhookService, type SecretStore } from '../webhooks/webhook.service';
import { PG_POOL, SECRET_STORE } from './core.tokens';
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
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
  exports: [FieldTypeRegistry, PG_POOL],
})
export class CoreModule {}
