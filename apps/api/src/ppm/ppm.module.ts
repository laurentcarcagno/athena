import { Module } from '@nestjs/common';
import { KpiService } from '../agile/kpi.service';
import { CoreModule } from '../core/core.module';
import { Db } from '../core/db';
import { FeatureController } from './feature.controller';
import { FeatureGuard, FeatureService } from './feature.service';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';
import { PortfolioController, TeamController } from './portfolio.controller';
import { ProjectMetaController } from './project-meta.controller';
import { ProjectMetaService } from './project-meta.service';
import { StatusNoteController } from './status-note.controller';
import { StatusNoteService } from './status-note.service';
import { PpmSettingsController } from './settings.controller';
import { PpmSettingsService } from './settings.service';
import { PortfolioService } from './portfolio.service';
import { TeamService } from './team.service';

/**
 * Gestion de portefeuille de projets (étude `docs/ppm/`, ADR-0008) : équipes, portefeuilles et, aux lots suivants, cycle de vie,
 * phases datées, instantanés, roadmap, capacité et finances. Les services du noyau (base, indicateurs de projet, résolution de
 * l'organisation) viennent de `CoreModule` ; le PPM référence les objets du projet et ne les copie jamais.
 */
@Module({
  imports: [CoreModule],
  controllers: [FeatureController, PpmSettingsController, ProjectMetaController, StatusNoteController, LifecycleController, TeamController, PortfolioController],
  providers: [
    { provide: FeatureService, useFactory: (db: Db) => new FeatureService(db), inject: [Db] },
    FeatureGuard,
    { provide: PpmSettingsService, useFactory: (db: Db) => new PpmSettingsService(db), inject: [Db] },
    { provide: ProjectMetaService, useFactory: (db: Db) => new ProjectMetaService(db), inject: [Db] },
    { provide: StatusNoteService, useFactory: (db: Db) => new StatusNoteService(db), inject: [Db] },
    { provide: LifecycleService, useFactory: (db: Db) => new LifecycleService(db), inject: [Db] },
    { provide: TeamService, useFactory: (db: Db) => new TeamService(db), inject: [Db] },
    { provide: PortfolioService, useFactory: (db: Db, k: KpiService) => new PortfolioService(db, k), inject: [Db, KpiService] },
  ],
})
export class PpmModule {}
