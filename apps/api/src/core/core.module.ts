import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Pool } from 'pg';
import { loadConfig } from '../config';
import { ArtifactService } from './artifact.service';
import { CoreController } from './core.controller';
import { Db } from './db';
import { FieldTypeRegistry } from './field-types';
import { SearchService } from '../atql/search.service';
import { LinkService } from './link.service';
import { DomainErrorFilter, OrgResolver } from './http';
import { TrackerService } from './tracker.service';

export const PG_POOL = Symbol('PG_POOL');

@Module({
  controllers: [CoreController],
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
    { provide: APP_FILTER, useClass: DomainErrorFilter },
  ],
  exports: [FieldTypeRegistry],
})
export class CoreModule {}
