import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import DashboardController from './dashboard.controller';
import DashboardService from './dashboard.service';
import InMemoryPortfolioRepository from './in-memory/in-memory-portfolio.repository';
import MongoPortfolioRepository from './mongo/mongo-portfolio.repository';
import ApplicationsModule from '../applications/applications.module';

@Module({
    imports: [ApplicationsModule],
    controllers: [DashboardController],
    providers: [
        DashboardService,
        InMemoryPortfolioRepository,
        MongoPortfolioRepository,
        {
            provide: 'PortfolioRepository',
            useFactory: (
                configService: ConfigService,
                inMemoryPortfolioRepository: InMemoryPortfolioRepository,
                mongoPortfolioRepository: MongoPortfolioRepository
            ) => {
                const mongoUrl =
                    configService.get<string>('API_MONGODB_API_DB_URL') ||
                    configService.get<string>('API_MONGODB_DB_URL');

                return mongoUrl ? mongoPortfolioRepository : inMemoryPortfolioRepository;
            },
            inject: [ConfigService, InMemoryPortfolioRepository, MongoPortfolioRepository],
        },
    ],
})
export default class DashboardModule {}
