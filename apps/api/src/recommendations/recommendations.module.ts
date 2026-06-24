import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import MockLlmClient from './mock-llm-client';
import RealLlmClient from './real-llm-client';
import { RECOMMENDATION_LLM_CLIENT, RecommendationLlmClient } from './recommendation-llm-client';
import RecommendationsService from './recommendations.service';
import ApplicationsModule from '../applications/applications.module';
import InMemoryPortfolioRepository from '../dashboard/in-memory/in-memory-portfolio.repository';
import MongoPortfolioRepository from '../dashboard/mongo/mongo-portfolio.repository';
import HealthSnapshotsModule from '../health-snapshots/health-snapshots.module';

@Module({
    imports: [ApplicationsModule, HealthSnapshotsModule],
    providers: [
        RecommendationsService,
        MockLlmClient,
        RealLlmClient,
        InMemoryPortfolioRepository,
        MongoPortfolioRepository,
        {
            // Read-only portfolio access, scoped the same way the dashboard reads it —
            // bound here (not imported from DashboardModule) to keep the module graph
            // acyclic: DashboardModule imports this module for the controller route.
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
        {
            // Real when a provider is configured, the grounded deterministic mock
            // otherwise — same toggle convention as the Datadog real-vs-mock client.
            provide: RECOMMENDATION_LLM_CLIENT,
            useFactory: (
                configService: ConfigService,
                real: RealLlmClient,
                mock: MockLlmClient
            ): RecommendationLlmClient =>
                configService.get<string>('RECOMMENDATIONS_LLM_PROVIDER') ? real : mock,
            inject: [ConfigService, RealLlmClient, MockLlmClient],
        },
    ],
    exports: [RecommendationsService],
})
export default class RecommendationsModule {}
