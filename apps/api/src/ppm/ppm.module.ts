import { Module } from '@nestjs/common';
import { KpiService } from '../agile/kpi.service';
import { CoreModule } from '../core/core.module';
import { Db } from '../core/db';
import { FeatureController } from './feature.controller';
import { FeatureGuard, FeatureService } from './feature.service';
import { HealthService } from './health.service';
import { RoadmapService } from './roadmap.service';
import { SnapshotService } from './snapshot.service';
import { ReviewService } from './review.service';
import { GovernanceService } from './governance.service';
import { AllocationController, CapacityController } from './capacity.controller';
import { CapacityDataService } from './capacity-data.service';
import { WorklogController } from './worklog.controller';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { DependencyController } from './dependency.controller';
import { DependencyService } from './dependency.service';
import { WorklogService } from './worklog.service';
import { CapacityService } from './capacity.service';
import { CalendarService } from '../core/calendar.service';
import { ScheduleService } from '../planning/schedule.service';
import { TemplateUpgradeService } from '../core/template-upgrade.service';
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
import { UsageService } from './usage.service';
import { TeamService } from './team.service';

/**
 * Gestion de portefeuille de projets (étude `docs/ppm/`, ADR-0008) : équipes, portefeuilles et, aux lots suivants, cycle de vie,
 * phases datées, instantanés, roadmap, capacité et finances. Les services du noyau (base, indicateurs de projet, résolution de
 * l'organisation) viennent de `CoreModule` ; le PPM référence les objets du projet et ne les copie jamais.
 */
@Module({
  imports: [CoreModule],
  controllers: [FinanceController, DependencyController, WorklogController, CapacityController, AllocationController, FeatureController, PpmSettingsController, ProjectMetaController, StatusNoteController, LifecycleController, TeamController, PortfolioController],
  providers: [
    { provide: FeatureService, useFactory: (db: Db) => new FeatureService(db), inject: [Db] },
    FeatureGuard,
    { provide: PpmSettingsService, useFactory: (db: Db) => new PpmSettingsService(db), inject: [Db] },
    { provide: ProjectMetaService, useFactory: (db: Db) => new ProjectMetaService(db), inject: [Db] },
    { provide: UsageService, useFactory: (db: Db) => new UsageService(db), inject: [Db] },
    { provide: StatusNoteService, useFactory: (db: Db) => new StatusNoteService(db), inject: [Db] },
    { provide: LifecycleService, useFactory: (db: Db) => new LifecycleService(db), inject: [Db] },
    { provide: HealthService, useFactory: (db: Db, p: PortfolioService, l: LifecycleService) => new HealthService(db, p, l), inject: [Db, PortfolioService, LifecycleService] },
    { provide: RoadmapService, useFactory: (db: Db, t: TemplateUpgradeService, s: ScheduleService, l: LifecycleService) => new RoadmapService(db, t, s, l), inject: [Db, TemplateUpgradeService, ScheduleService, LifecycleService] },
    { provide: SnapshotService, useFactory: (db: Db, h: HealthService) => new SnapshotService(db, h), inject: [Db, HealthService] },
    { provide: ReviewService, useFactory: (db: Db, s: SnapshotService) => new ReviewService(db, s), inject: [Db, SnapshotService] },
    { provide: GovernanceService, useFactory: (db: Db, t: TemplateUpgradeService) => new GovernanceService(db, t), inject: [Db, TemplateUpgradeService] },
    { provide: CapacityDataService, useFactory: (db: Db) => new CapacityDataService(db), inject: [Db] },
    { provide: CapacityService, useFactory: (db: Db, c: CalendarService, s: PpmSettingsService) => new CapacityService(db, c, s), inject: [Db, CalendarService, PpmSettingsService] },
    { provide: WorklogService, useFactory: (db: Db, c: CalendarService, s: PpmSettingsService) => new WorklogService(db, c, s), inject: [Db, CalendarService, PpmSettingsService] },
    { provide: DependencyService, useFactory: (db: Db, s: ScheduleService, c: CalendarService) => new DependencyService(db, s, c), inject: [Db, ScheduleService, CalendarService] },
    { provide: FinanceService, useFactory: (db: Db) => new FinanceService(db), inject: [Db] },
    { provide: TeamService, useFactory: (db: Db) => new TeamService(db), inject: [Db] },
    { provide: PortfolioService, useFactory: (db: Db, k: KpiService) => new PortfolioService(db, k), inject: [Db, KpiService] },
  ],
})
export class PpmModule {}
