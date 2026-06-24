import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import DashboardController from './dashboard.controller';
import DashboardService from './dashboard.service';
import InMemoryPortfolioRepository from './in-memory/in-memory-portfolio.repository';
import InternalDigestController from './internal-digest.controller';
import MongoPortfolioRepository from './mongo/mongo-portfolio.repository';
import ApplicationsModule from '../applications/applications.module';
import InternalSyncGuard from '../datadog/internal-sync.guard';
import HealthSnapshotsModule from '../health-snapshots/health-snapshots.module';
import RecommendationsModule from '../recommendations/recommendations.module';

@Module({
    imports: [ApplicationsModule, HealthSnapshotsModule, RecommendationsModule],
    controllers: [DashboardController, InternalDigestController],
    providers: [
        DashboardService,
        InternalSyncGuard,
        InMemoryPortfolioRepository,
        MongoPortfolioRepository,
        {
            provide: 'PortfolioRepository',
            useFactory: (
                configService: ConfigService,
                inMemoryPortfolioRepository: InMemoryPortfolioRepository,
                mongoPortfolioRepository: MongoPortfolioRepository
            ) => {
                const useRealData = configService.get<string>('USE_REAL_DATA') === 'true';
                const mongoUrl =
                    configService.get<string>('API_MONGODB_API_DB_URL') ||
                    configService.get<string>('API_MONGODB_DB_URL');

                return mongoUrl && useRealData
                    ? mongoPortfolioRepository
                    : inMemoryPortfolioRepository;
            },
            inject: [ConfigService, InMemoryPortfolioRepository, MongoPortfolioRepository],
        },
    ],
})
export default class DashboardModule {}
